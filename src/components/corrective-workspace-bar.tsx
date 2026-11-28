import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { countCapaEffectivenessDue, countOverdueFindings, isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";

// KHẮC PHỤC & CAPA — dựng theo khuôn đã dùng ở Kho hóa chất (lab-supplies-client.tsx):
//   1 thanh "Cần xử lý" dạng chip (bấm là tới đúng danh sách cần làm) + các tab theo ĐÚNG LUỒNG VIỆC nằm ngay trong trang:
//   Phát hiện → CAPA đang xử lý → Đánh giá hiệu lực → Đã đóng → Phân tích.
// Không xóa trang nào: /findings và /capa vẫn là 2 trang thật (sidebar vẫn trỏ tới), thanh này chỉ đặt chúng vào cùng 1 luồng.
// Số đếm dùng chung quality-priority-signals.ts với Dashboard nên không lệch nhau.

export type CorrectiveTab = "findings" | "capa" | "review" | "closed" | "analytics";

const CAPA_CLOSED = new Set(["EFFECTIVE", "CLOSED", "CANCELLED"]);

export async function CorrectiveWorkspaceBar({ active, year }: { active: CorrectiveTab; year: number }) {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const recordsRes = await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", ["FINDING", "CAPA"]).eq("work_year", year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const findingIds = records.filter((r) => r.record_type === "FINDING").map((r) => r.id);
  const capaIds = records.filter((r) => r.record_type === "CAPA").map((r) => r.id);
  const [findingsRes, capasRes] = await Promise.all([
    findingIds.length ? supabase.from("findings").select("id,record_id,workflow_status,due_date").in("record_id", findingIds) : Promise.resolve({ data: [] as any[], error: null }),
    capaIds.length ? supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date").in("record_id", capaIds) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const findings = (findingsRes.data ?? []) as any[];
  const capas = (capasRes.data ?? []) as any[];

  const findingOpen = findings.filter((x) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status))).length;
  const findingOverdue = countOverdueFindings(findings, today);
  const capaActive = capas.filter((x) => !CAPA_CLOSED.has(String(x.workflow_status)));
  const capaPendingApproval = capaActive.filter((x) => String(x.workflow_status) === "PENDING_APPROVAL").length;
  const capaReviewDue = countCapaEffectivenessDue(capas, today);
  const capaReviewOverdue = capaActive.filter((x) => isPastDue(x.effectiveness_due_date, today)).length;
  const capaClosed = capas.length - capaActive.length;

  const chips: FlowChip[] = [
    { n: findingOverdue, tone: "danger", text: `${findingOverdue} Finding quá hạn — cần rà Action & minh chứng`, href: "/findings?overdue=1" },
    { n: capaReviewOverdue, tone: "danger", text: `${capaReviewOverdue} CAPA quá hạn đánh giá hiệu lực`, href: "/capa?tab=review" },
    { n: capaPendingApproval, tone: "warning", text: `${capaPendingApproval} CAPA chờ phê duyệt`, href: "/capa?status=PENDING_APPROVAL" },
    { n: capaReviewDue - capaReviewOverdue, tone: "info", text: `${Math.max(0, capaReviewDue - capaReviewOverdue)} CAPA đang chờ đánh giá hiệu lực`, href: "/capa?tab=review" },
  ];

  const tabs: FlowTab[] = [
    { key: "findings", label: "Phát hiện", href: "/findings", count: findingOpen },
    { key: "capa", label: "CAPA đang xử lý", href: "/capa", count: capaActive.length },
    { key: "review", label: "Đánh giá hiệu lực", href: "/capa?tab=review", count: capaReviewDue },
    { key: "closed", label: "Đã đóng", href: "/capa?tab=closed", count: capaClosed },
    { key: "analytics", label: "Phân tích", href: "/capa?tab=analytics", count: null },
  ];

  return <WorkspaceFlowBar ariaLabel="Luồng việc Khắc phục & CAPA" tabs={tabs} active={active} chips={chips} emptyText="Không có Finding hay CAPA nào cần xử lý gấp." />;
}
