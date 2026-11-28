import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { createClient } from "@/lib/supabase/server";

// RỦI RO & FMEA — cùng khuôn Kho hóa chất / Khắc phục & CAPA / Sự cố & Phản ánh: tab theo luồng việc + thanh "Cần xử lý".
//   Đang mở → Đánh giá & xử lý → Theo dõi & rà soát → Đã ngừng → FMEA / HFMEA → Thang điểm → Phân tích.
// Không xóa trang nào: /risks, /fmea, /risks/score-tool vẫn là 3 trang thật (cùng quyền risk.view/risk.manage).

export type RiskTab = "open" | "treatment" | "monitoring" | "retired" | "fmea" | "score" | "analytics";

export const RISK_TREATMENT = new Set(["IDENTIFIED", "ASSESSED", "TREATMENT_REQUIRED"]);
export const RISK_MONITORING = new Set(["RISK_ACCEPTED", "MONITORING"]);
export const RISK_HIGH_LEVELS = new Set(["EXTREME", "CRITICAL", "VERY_HIGH", "HIGH", "RED"]);

export async function RiskWorkspaceBar({ active, year }: { active: RiskTab; year: number }) {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const recordsRes = await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", ["RISK", "FMEA"]).eq("work_year", year);
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const riskRecordIds = records.filter((r) => r.record_type === "RISK").map((r) => r.id);
  const fmeaRecordIds = records.filter((r) => r.record_type === "FMEA").map((r) => r.id);
  const [riskRes, fmeaRes] = await Promise.all([
    riskRecordIds.length ? supabase.from("risks").select("id,record_id,workflow_status,next_review_date").in("record_id", riskRecordIds) : Promise.resolve({ data: [] as any[] }),
    fmeaRecordIds.length ? supabase.from("fmea_studies").select("id,record_id,workflow_status").in("record_id", fmeaRecordIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const risks = (riskRes.data ?? []) as any[];
  const riskIds = risks.map((r) => r.id);
  const assessRes = riskIds.length ? await supabase.from("risk_assessments").select("risk_id,calculated_level,assessment_date,created_at").in("risk_id", riskIds).order("assessment_date", { ascending: false }).order("created_at", { ascending: false }) : { data: [] as any[] };
  const latestLevel = new Map<string, string>();
  for (const a of (assessRes.data ?? []) as any[]) if (!latestLevel.has(a.risk_id)) latestLevel.set(a.risk_id, String(a.calculated_level || ""));
  const fmeas = (fmeaRes.data ?? []) as any[];

  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const open = risks.filter((r) => st(r) !== "RETIRED");
  const high = open.filter((r) => RISK_HIGH_LEVELS.has(String(latestLevel.get(r.id) || "").toUpperCase())).length;
  const due = open.filter((r) => r.next_review_date && String(r.next_review_date).slice(0, 10) <= today).length;
  const unassessed = open.filter((r) => !latestLevel.has(r.id)).length;
  const treatment = open.filter((r) => st(r) === "TREATMENT_REQUIRED").length;
  const fmeaOpen = fmeas.filter((x) => st(x) !== "CLOSED");
  const fmeaPending = fmeaOpen.filter((x) => st(x) === "PENDING_APPROVAL").length;
  const fmeaRescore = fmeaOpen.filter((x) => st(x) === "RESIDUAL_REVIEW").length;

  const chips: FlowChip[] = [
    { n: high, tone: "danger", text: `${high} rủi ro mức cao / rất cao đang mở`, href: "/risks?filter=high" },
    { n: due, tone: "danger", text: `${due} rủi ro đến hạn rà soát`, href: "/risks?filter=due" },
    { n: treatment, tone: "warning", text: `${treatment} rủi ro cần biện pháp xử lý`, href: "/risks?filter=treatment" },
    { n: unassessed, tone: "info", text: `${unassessed} rủi ro chưa đánh giá`, href: "/risks?filter=unassessed" },
    { n: fmeaPending, tone: "warning", text: `${fmeaPending} FMEA chờ phê duyệt`, href: "/fmea?stage=PENDING_APPROVAL" },
    { n: fmeaRescore, tone: "info", text: `${fmeaRescore} FMEA chờ chấm lại rủi ro tồn dư`, href: "/fmea?stage=RESIDUAL_REVIEW" },
  ];

  const tabs: FlowTab[] = [
    { key: "open", label: "Rủi ro đang mở", href: "/risks", count: open.length },
    { key: "treatment", label: "Đánh giá & xử lý", href: "/risks?tab=treatment", count: open.filter((r) => RISK_TREATMENT.has(st(r))).length },
    { key: "monitoring", label: "Theo dõi & rà soát", href: "/risks?tab=monitoring", count: open.filter((r) => RISK_MONITORING.has(st(r))).length },
    { key: "retired", label: "Đã ngừng", href: "/risks?tab=retired", count: risks.length - open.length },
    { key: "fmea", label: "FMEA / HFMEA", href: "/fmea", count: fmeaOpen.length },
    { key: "score", label: "Thang điểm", href: "/risks/score-tool", count: null },
    { key: "analytics", label: "Phân tích", href: "/risks?tab=analytics", count: null },
  ];

  return <WorkspaceFlowBar ariaLabel="Luồng việc Rủi ro & FMEA" tabs={tabs} active={active} chips={chips} emptyText="Không có rủi ro hay FMEA nào cần xử lý gấp." />;
}
