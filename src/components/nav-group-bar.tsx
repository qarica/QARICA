import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { requireUserContext } from "@/lib/auth";
import { visibleNavGroups } from "@/lib/navigation";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

// Khuôn Kho hóa chất cho các nhóm menu ngoài QLCL (Điều hành, Văn bản, Hành nghề, Kiểm soát nhiễm khuẩn):
// tab = đúng các dòng của nhóm đó trong sidebar (lấy từ navigation.ts — cùng một nguồn, cùng quyền xem), cộng thanh "Cần xử lý".
// Không thêm hay bớt trang nào; tab chỉ là lối đi nhanh giữa các trang cùng nhóm.

export type NavGroupKey = "operations" | "document-publications" | "physician-license" | "infection-control";

function addDays(day: string, n: number) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

async function groupChips(group: NavGroupKey, year: number, hrefs: Set<string>): Promise<FlowChip[]> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const st = (x: any) => String(x.workflow_status ?? x.status ?? x.stage ?? "").toUpperCase();
  if (group === "operations") {
    const chips: FlowChip[] = [];
    if (hrefs.has("/reports")) {
      const rec = await supabase.from("records").select("id,lifecycle_status").eq("record_type", "REPORT").eq("work_year", year);
      const ids = ((rec.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status)).map((r) => r.id);
      const ob = ids.length ? await supabase.from("reporting_obligations").select("record_id,workflow_status,due_date").in("record_id", ids) : { data: [] as any[] };
      const n = ((ob.data ?? []) as any[]).filter((x) => !["COMPLETED", "CANCELLED"].includes(st(x)) && isPastDue(x.due_date, today)).length;
      chips.push({ n, tone: "danger", text: `${n} nghĩa vụ báo cáo quá hạn`, href: "/reports?attention=overdue" });
    }
    if (hrefs.has("/plans")) {
      const pp = await supabase.from("vw_program_progress").select("overdue_actions").eq("work_year", year);
      const n = ((pp.data ?? []) as any[]).reduce((s, x) => s + Number(x.overdue_actions || 0), 0);
      chips.push({ n, tone: "warning", text: `${n} Action kế hoạch quá hạn`, href: "/plans" });
    }
    return chips;
  }
  if (group === "document-publications") {
    const chips: FlowChip[] = [];
    if (hrefs.has("/document-publications")) {
      const dp = await supabase.from("document_publications").select("stage,review_date,stage_due_date");
      const rows = (dp.data ?? []) as any[];
      const reviewOverdue = rows.filter((x) => String(x.stage) === "PUBLISHED" && isPastDue(x.review_date, today)).length;
      const stageOverdue = rows.filter((x) => !["PUBLISHED", "RETRACTED", "CANCELLED"].includes(String(x.stage)) && isPastDue(x.stage_due_date, today)).length;
      chips.push({ n: stageOverdue, tone: "danger", text: `${stageOverdue} văn bản đang xử lý quá hạn bước`, href: "/document-publications" });
      chips.push({ n: reviewOverdue, tone: "warning", text: `${reviewOverdue} văn bản quá hạn rà soát định kỳ`, href: "/document-publications" });
    }
    if (hrefs.has("/procedure-trainings")) {
      const pt = await supabase.from("procedure_trainings").select("status");
      const n = ((pt.data ?? []) as any[]).filter((x) => st(x) === "NOT_PLANNED").length;
      chips.push({ n, tone: "info", text: `${n} quy trình chưa có kế hoạch đào tạo`, href: "/procedure-trainings" });
    }
    return chips;
  }
  if (group === "physician-license") {
    const chips: FlowChip[] = [];
    if (hrefs.has("/physician-license")) {
      const reg = await supabase.from("physician_license_registrations").select("status,deadline");
      const pending = ((reg.data ?? []) as any[]).filter((x) => st(x) === "PENDING");
      const overdue = pending.filter((x) => isPastDue(x.deadline, today)).length;
      const soon = pending.filter((x) => x.deadline && String(x.deadline) >= today && String(x.deadline) <= addDays(today, 7)).length;
      chips.push({ n: overdue, tone: "danger", text: `${overdue} hồ sơ quá hạn đăng ký hành nghề`, href: "/physician-license" });
      chips.push({ n: soon, tone: "warning", text: `${soon} hồ sơ đến hạn đăng ký trong 7 ngày`, href: "/physician-license" });
    }
    if (hrefs.has("/practitioner-credentials")) {
      const cr = await supabase.from("practitioner_credentials").select("license_expiry_date");
      const n = ((cr.data ?? []) as any[]).filter((x) => x.license_expiry_date && String(x.license_expiry_date) <= addDays(today, 60)).length;
      chips.push({ n, tone: "warning", text: `${n} chứng chỉ hành nghề hết hạn hoặc sắp hết hạn (60 ngày)`, href: "/practitioner-credentials" });
    }
    return chips;
  }
  if (group === "infection-control") {
    const chips: FlowChip[] = [];
    if (hrefs.has("/infection-control")) {
      const cs = await supabase.from("infection_control_cases").select("status");
      const n = ((cs.data ?? []) as any[]).filter((x) => st(x) === "NGHI_NGO").length;
      chips.push({ n, tone: "warning", text: `${n} ca nghi ngờ nhiễm khuẩn chờ xác nhận`, href: "/infection-control" });
    }
    return chips;
  }
  return [];
}

export async function NavGroupBar({ group, active, year, ariaLabel, emptyText }: { group: NavGroupKey; active: string; year?: number; ariaLabel: string; emptyText: string }) {
  const { user } = await requireUserContext();
  const workYear = year ?? await getWorkYear();
  const items = visibleNavGroups(user).find((g) => g.id === group)?.children ?? [];
  // Nhóm Điều hành trong sidebar có thêm "Tổng quan QLCL" (Dashboard) — đó là trang tổng, không phải một bước của nhóm.
  const tabs: FlowTab[] = items.filter((c) => c.href.split("?")[0] !== "/dashboard").map((c) => ({ key: c.href.split("?")[0], label: c.label, href: c.href, count: null }));
  const chips = await groupChips(group, workYear, new Set(tabs.map((t) => t.key)));
  return <WorkspaceFlowBar ariaLabel={ariaLabel} tabs={tabs} active={active} chips={chips} emptyText={emptyText} />;
}
