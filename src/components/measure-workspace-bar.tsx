import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { countOutOfTargetIndicators, isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";

// ĐO LƯỜNG & GIÁM SÁT — cùng khuôn Kho hóa chất / các nhóm QLCL khác: tab theo luồng việc + thanh "Cần xử lý".
//   Chỉ số chất lượng → Giám sát & Bảng kiểm → Tổng hợp 5S → Phân tích giám sát.
// Không xóa trang nào; "Quản lý chỉ số" vẫn là nút ở /indicators (yêu cầu cũ), không thành tab.

export type MeasureTab = "indicators" | "monitoring" | "fives" | "analytics";

export const INDICATOR_PERMISSIONS = ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"];
export const MONITORING_PERMISSIONS = ["monitoring.view", "monitoring.perform", "checklists.view", "checklists.manage"];
export const FIVE_S_PERMISSIONS = ["checklists.view", "checklists.manage", "monitoring.perform"];
const ROUND_DONE = new Set(["CONFIRMED", "CLOSED", "CANCELLED"]);

export async function MeasureWorkspaceBar({ active, year }: { active: MeasureTab; year: number }) {
  const { user } = await requireUserContext();
  const can = { indicators: hasAnyPermission(user, INDICATOR_PERMISSIONS), monitoring: hasAnyPermission(user, MONITORING_PERMISSIONS), fives: hasAnyPermission(user, FIVE_S_PERMISSIONS) };
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  const recRes = can.indicators ? await supabase.from("records").select("id,lifecycle_status").eq("record_type", "INDICATOR_MEASUREMENT").eq("work_year", year) : { data: [] as any[] };
  const measRecordIds = ((recRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status)).map((r) => r.id);
  const [measRes, roundRes] = await Promise.all([
    measRecordIds.length ? supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level").in("record_id", measRecordIds) : Promise.resolve({ data: [] as any[] }),
    can.monitoring ? supabase.from("monitoring_rounds").select("id,workflow_status,scheduled_date").eq("work_year", year).neq("workflow_status", "CANCELLED") : Promise.resolve({ data: [] as any[] }),
  ]);
  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const meas = (measRes.data ?? []) as any[];
  const rounds = (roundRes.data ?? []) as any[];
  const submitted = meas.filter((x) => st(x) === "SUBMITTED").length;
  const returned = meas.filter((x) => st(x) === "RETURNED").length;
  const outTarget = countOutOfTargetIndicators(meas);
  const roundsOpen = rounds.filter((x) => !ROUND_DONE.has(st(x)));
  const roundsOverdue = roundsOpen.filter((x) => st(x) === "SCHEDULED" && isPastDue(x.scheduled_date, today)).length;

  const chips: FlowChip[] = [
    ...(can.indicators ? [
      { n: outTarget, tone: "danger" as const, text: `${outTarget} kỳ chỉ số ngoài mục tiêu — cần phân tích nguyên nhân`, href: "/indicators?attention=out" },
      { n: submitted, tone: "warning" as const, text: `${submitted} kỳ đo chờ xác minh`, href: "/indicators?attention=submitted" },
      { n: returned, tone: "info" as const, text: `${returned} kỳ đo bị trả lại cần bổ sung`, href: "/indicators?attention=returned" },
    ] : []),
    ...(can.monitoring ? [{ n: roundsOverdue, tone: "danger" as const, text: `${roundsOverdue} đợt giám sát quá ngày dự kiến chưa thực hiện`, href: "/monitoring" }] : []),
  ];

  const tabs: FlowTab[] = [
    ...(can.indicators ? [{ key: "indicators", label: "Chỉ số chất lượng", href: "/indicators", count: meas.length }] : []),
    ...(can.monitoring ? [{ key: "monitoring", label: "Giám sát & Bảng kiểm", href: "/monitoring", count: roundsOpen.length }] : []),
    ...(can.fives ? [{ key: "fives", label: "Tổng hợp 5S", href: "/monitoring/5s-tong-hop", count: null }] : []),
    ...(can.monitoring ? [{ key: "analytics", label: "Phân tích giám sát", href: "/monitoring?tab=analytics", count: null }] : []),
  ];

  return <WorkspaceFlowBar ariaLabel="Luồng việc Đo lường & Giám sát" tabs={tabs} active={active} chips={chips} emptyText="Không có kỳ đo hay đợt giám sát nào cần xử lý gấp." />;
}

// Lọc danh sách /indicators khi bấm một mục "Cần xử lý" (?attention=out|submitted|returned) — cùng điều kiện với thanh.
export async function indicatorAttentionRecordIds(attention: string | undefined): Promise<{ ids: string[]; label: string } | null> {
  const LABEL: Record<string, string> = { out: "Kỳ chỉ số ngoài mục tiêu", submitted: "Kỳ đo chờ xác minh", returned: "Kỳ đo bị trả lại" };
  if (!attention || !LABEL[attention]) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("indicator_measurements").select("record_id,workflow_status,result_level");
  const rows = (data ?? []) as any[];
  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const hit = attention === "out" ? rows.filter((x) => countOutOfTargetIndicators([x]) === 1) : rows.filter((x) => st(x) === (attention === "submitted" ? "SUBMITTED" : "RETURNED"));
  return { ids: hit.map((x) => String(x.record_id)), label: LABEL[attention] };
}
