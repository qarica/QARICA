import { WorkspaceFlowBar, type FlowChip, type FlowTab } from "@/components/workspace-flow-bar";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { isPastDue } from "@/lib/quality-priority-signals";
import { createClient } from "@/lib/supabase/server";

// ĐÁNH GIÁ & KIỂM TRA — cùng khuôn Kho hóa chất / Khắc phục & CAPA / Sự cố / Rủi ro: tab theo luồng việc + thanh "Cần xử lý".
//   Tự đánh giá → Đánh giá ngoài → Audit / Tracer → Tiếp đoàn.
// Bộ tiêu chí KHÔNG là tab (yêu cầu cũ: "Dời nút bộ tiêu chí vào nút quản lý bộ tiêu chí") — vào bằng nút "Quản lý bộ tiêu chí" ở /assessments.
// Không xóa trang nào; tab chỉ hiện khi người dùng có đúng quyền mà chính trang đó kiểm tra.

export type AssessmentTab = "self" | "external" | "audit" | "inspection";

export const SELF_PERMISSIONS = ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"];
export const EXTERNAL_PERMISSIONS = ["criteria.view", "criteria.review", "criteria.manage"];
export const AUDIT_PERMISSIONS = ["audit.view", "audit.perform", "audit.manage"];
export const INSPECTION_PERMISSIONS = ["inspections.view", "inspections.manage"];
export const ROUND_DONE = new Set(["FINALIZED", "CLOSED", "CANCELLED"]);
export const AUDIT_DONE = new Set(["CLOSED", "CANCELLED"]);
export const INSPECTION_DONE = new Set(["CLOSED", "CANCELLED", "COMPLETED"]);

function addDays(day: string, n: number) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export async function AssessmentWorkspaceBar({ active, year }: { active: AssessmentTab; year: number }) {
  const { user } = await requireUserContext();
  const can = {
    self: hasAnyPermission(user, SELF_PERMISSIONS),
    external: hasAnyPermission(user, EXTERNAL_PERMISSIONS),
    audit: hasAnyPermission(user, AUDIT_PERMISSIONS),
    inspection: hasAnyPermission(user, INSPECTION_PERMISSIONS),
  };
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const types = [can.self ? "ASSESSMENT" : null, can.external ? "EXTERNAL_ASSESSMENT" : null, can.audit ? "AUDIT" : null, can.inspection ? "INSPECTION" : null].filter(Boolean) as string[];
  const recordsRes = types.length ? await supabase.from("records").select("id,record_type,lifecycle_status").in("record_type", types).eq("work_year", year) : { data: [] as any[] };
  const records = ((recordsRes.data ?? []) as any[]).filter((r) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const idsOf = (t: string) => records.filter((r) => r.record_type === t).map((r) => r.id);
  const [roundsRes, auditsRes, inspectRes] = await Promise.all([
    idsOf("ASSESSMENT").length ? supabase.from("assessment_rounds").select("id,record_id,submission_deadline,workflow_status").in("record_id", idsOf("ASSESSMENT")) : Promise.resolve({ data: [] as any[] }),
    idsOf("AUDIT").length ? supabase.from("audits").select("id,record_id,end_date,workflow_status").in("record_id", idsOf("AUDIT")) : Promise.resolve({ data: [] as any[] }),
    idsOf("INSPECTION").length ? supabase.from("inspection_events").select("id,record_id,visit_date,workflow_status").in("record_id", idsOf("INSPECTION")) : Promise.resolve({ data: [] as any[] }),
  ]);
  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  const rounds = (roundsRes.data ?? []) as any[];
  const audits = (auditsRes.data ?? []) as any[];
  const inspections = (inspectRes.data ?? []) as any[];
  const in7 = addDays(today, 7);
  const in14 = addDays(today, 14);

  const roundOverdue = rounds.filter((x) => !ROUND_DONE.has(st(x)) && isPastDue(x.submission_deadline, today)).length;
  const auditNearDue = audits.filter((x) => !AUDIT_DONE.has(st(x)) && x.end_date && String(x.end_date).slice(0, 10) >= today && String(x.end_date).slice(0, 10) <= in7).length;
  const auditOverdue = audits.filter((x) => !AUDIT_DONE.has(st(x)) && isPastDue(x.end_date, today)).length;
  const inspectionSoon = inspections.filter((x) => !INSPECTION_DONE.has(st(x)) && x.visit_date && String(x.visit_date).slice(0, 10) >= today && String(x.visit_date).slice(0, 10) <= in14).length;

  const chips: FlowChip[] = [
    ...(can.self ? [{ n: roundOverdue, tone: "danger" as const, text: `${roundOverdue} đợt tự đánh giá quá hạn nộp`, href: "/assessments?attention=overdue" }] : []),
    ...(can.audit ? [
      { n: auditOverdue, tone: "danger" as const, text: `${auditOverdue} audit quá hạn kết thúc`, href: "/audits?attention=overdue" },
      { n: auditNearDue, tone: "warning" as const, text: `${auditNearDue} audit sắp đến hạn (7 ngày)`, href: "/audits?attention=soon" },
    ] : []),
    ...(can.inspection ? [{ n: inspectionSoon, tone: "info" as const, text: `${inspectionSoon} đợt tiếp đoàn trong 14 ngày tới — cần chuẩn bị`, href: "/inspections?attention=soon" }] : []),
  ];

  const tabs: FlowTab[] = [
    ...(can.self ? [{ key: "self", label: "Tự đánh giá", href: "/assessments", count: idsOf("ASSESSMENT").length }] : []),
    ...(can.external ? [{ key: "external", label: "Đánh giá ngoài", href: "/external-assessments", count: idsOf("EXTERNAL_ASSESSMENT").length }] : []),
    ...(can.audit ? [{ key: "audit", label: "Audit / Tracer", href: "/audits", count: idsOf("AUDIT").length }] : []),
    ...(can.inspection ? [{ key: "inspection", label: "Tiếp đoàn", href: "/inspections", count: idsOf("INSPECTION").length }] : []),
  ];

  return <WorkspaceFlowBar ariaLabel="Luồng việc Đánh giá & Kiểm tra" tabs={tabs} active={active} chips={chips} emptyText="Không có đợt đánh giá, audit hay tiếp đoàn nào cần xử lý gấp." />;
}

// Lọc danh sách khi bấm một mục "Cần xử lý" (?attention=overdue|soon) — cùng điều kiện với thanh ở trên.
export async function assessmentAttentionRecordIds(kind: "self" | "audit" | "inspection", attention: string | undefined): Promise<{ ids: string[]; label: string } | null> {
  if (attention !== "overdue" && attention !== "soon") return null;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const st = (x: any) => String(x.workflow_status ?? "").toUpperCase();
  if (kind === "self" && attention === "overdue") {
    const { data } = await supabase.from("assessment_rounds").select("record_id,submission_deadline,workflow_status");
    return { ids: ((data ?? []) as any[]).filter((x) => !ROUND_DONE.has(st(x)) && isPastDue(x.submission_deadline, today)).map((x) => String(x.record_id)), label: "Đợt tự đánh giá quá hạn nộp" };
  }
  if (kind === "audit") {
    const { data } = await supabase.from("audits").select("record_id,end_date,workflow_status");
    const rows = ((data ?? []) as any[]).filter((x) => !AUDIT_DONE.has(st(x)));
    if (attention === "overdue") return { ids: rows.filter((x) => isPastDue(x.end_date, today)).map((x) => String(x.record_id)), label: "Audit quá hạn kết thúc" };
    const in7 = addDays(today, 7);
    return { ids: rows.filter((x) => x.end_date && String(x.end_date).slice(0, 10) >= today && String(x.end_date).slice(0, 10) <= in7).map((x) => String(x.record_id)), label: "Audit sắp đến hạn (7 ngày)" };
  }
  if (kind === "inspection" && attention === "soon") {
    const { data } = await supabase.from("inspection_events").select("record_id,visit_date,workflow_status");
    const in14 = addDays(today, 14);
    return { ids: ((data ?? []) as any[]).filter((x) => !INSPECTION_DONE.has(st(x)) && x.visit_date && String(x.visit_date).slice(0, 10) >= today && String(x.visit_date).slice(0, 10) <= in14).map((x) => String(x.record_id)), label: "Đợt tiếp đoàn trong 14 ngày tới" };
  }
  return null;
}
