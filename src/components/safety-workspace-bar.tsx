import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { incidentHarmClassification } from "@/lib/incident-dashboard";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { countSeriousOpenIncidents, INCIDENT_CLOSED, isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";

// SỰ CỐ & PHẢN ÁNH — cùng khuôn Kho hóa chất / Khắc phục & CAPA: tab theo luồng việc + thanh "Cần xử lý".
//   Sự cố đang xử lý → Điều tra / RCA → Đã đóng → Phản ánh / Góp ý → Bài học / Cảnh báo → Phân tích.
// Không xóa trang nào: /incidents, /feedback, /safety-alerts vẫn là 3 trang thật; tab nào chỉ hiện khi người dùng có quyền
// xem trang đó (đúng quyền mà chính trang kiểm tra). Số sự cố nghiêm trọng dùng chung quality-priority-signals với Dashboard.

export type SafetyTab = "open" | "investigating" | "closed" | "feedback" | "lessons" | "analytics";

export const INCIDENT_PERMISSIONS = ["incident.report", "incident.view_summary", "incident.view_case", "incident.triage"];
export const FEEDBACK_PERMISSIONS = ["feedback.view", "feedback.manage"];
export const SAFETY_ALERT_PERMISSIONS = ["safety_alert.view", "safety_alert.edit", "safety_alert.publish"];
export const INCIDENT_INVESTIGATION = new Set(["INVESTIGATION_REQUIRED", "INVESTIGATING", "ACTION_FOLLOW_UP", "AWAITING_CLOSURE"]);
export const INCIDENT_TRIAGE = new Set(["REPORTED", "RETURNED"]);

export async function SafetyWorkspaceBar({ active, year }: { active: SafetyTab; year: number }) {
  const { user } = await requireUserContext();
  const canIncident = hasAnyPermission(user, INCIDENT_PERMISSIONS);
  const canFeedback = hasAnyPermission(user, FEEDBACK_PERMISSIONS);
  const canLessons = hasAnyPermission(user, SAFETY_ALERT_PERMISSIONS);
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  const types = [canIncident ? "INCIDENT" : null, canFeedback ? "FEEDBACK" : null].filter(Boolean) as string[];
  const recordsRes = types.length ? await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", types).eq("work_year", year) : { data: [] as any[] };
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const incidentIds = records.filter((r) => r.record_type === "INCIDENT").map((r) => r.id);
  const feedbackIds = records.filter((r) => r.record_type === "FEEDBACK").map((r) => r.id);
  const [incRes, fbRes] = await Promise.all([
    incidentIds.length ? supabase.from("incidents").select("id,record_id,workflow_status,serious_event_flag,harm_status").in("record_id", incidentIds) : Promise.resolve({ data: [] as any[] }),
    feedbackIds.length ? supabase.from("feedback_records").select("id,record_id,workflow_status,response_due_at").in("record_id", feedbackIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const incidents = (incRes.data ?? []) as any[];
  const feedback = (fbRes.data ?? []) as any[];

  const status = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const openIncidents = incidents.filter((x) => !INCIDENT_CLOSED.has(status(x)));
  const investigating = openIncidents.filter((x) => INCIDENT_INVESTIGATION.has(status(x))).length;
  const triage = openIncidents.filter((x) => INCIDENT_TRIAGE.has(status(x))).length;
  const unclassified = openIncidents.filter((x) => !incidentHarmClassification(x.harm_status)).length;
  const seriousOpen = countSeriousOpenIncidents(incidents);
  const feedbackOpen = feedback.filter((x) => !["CLOSED", "CANCELLED"].includes(status(x)));
  const feedbackOverdue = feedbackOpen.filter((x) => isPastDue(x.response_due_at, today)).length;

  const chips: FlowChip[] = [
    ...(canIncident ? [
      { n: seriousOpen, tone: "danger" as const, text: `${seriousOpen} sự cố nghiêm trọng đang mở — ưu tiên điều tra/RCA`, href: "/incidents?filter=serious" },
      { n: triage, tone: "warning" as const, text: `${triage} sự cố chờ xác minh & phân loại`, href: "/incidents?filter=triage" },
      { n: unclassified, tone: "warning" as const, text: `${unclassified} hồ sơ chưa phân loại mức tổn hại`, href: "/incidents?filter=unclassified" },
    ] : []),
    ...(canFeedback ? [{ n: feedbackOverdue, tone: "danger" as const, text: `${feedbackOverdue} phản ánh quá hạn phản hồi`, href: "/feedback?overdue=1" }] : []),
  ];

  const tabs: FlowTab[] = [
    ...(canIncident ? [
      { key: "open", label: "Sự cố đang xử lý", href: "/incidents", count: openIncidents.length },
      { key: "investigating", label: "Điều tra / RCA", href: "/incidents?tab=investigating", count: investigating },
      { key: "closed", label: "Đã đóng", href: "/incidents?tab=closed", count: incidents.length - openIncidents.length },
    ] : []),
    ...(canFeedback ? [{ key: "feedback", label: "Phản ánh / Góp ý", href: "/feedback", count: feedbackOpen.length }] : []),
    ...(canLessons ? [{ key: "lessons", label: "Bài học / Cảnh báo", href: "/safety-alerts", count: null }] : []),
    ...(canIncident ? [{ key: "analytics", label: "Phân tích", href: "/incidents?tab=analytics", count: null }] : []),
  ];

  return <WorkspaceFlowBar ariaLabel="Luồng việc Sự cố & Phản ánh" tabs={tabs} active={active} chips={chips} emptyText="Không có sự cố hay phản ánh nào cần xử lý gấp." />;
}
