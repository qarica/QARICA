import { QualityRecordEditClient } from "@/components/quality-record-edit-client";
import { requireUserContext } from "@/lib/auth";
import { canEditQualityRecord } from "@/lib/quality-record-edit";
import { createClient } from "@/lib/supabase/server";

function dateTimeLocalHcm(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}T${map.get("hour")}:${map.get("minute")}`;
}

export async function QualityRecordEditPanel({ recordId, recordType }: { recordId: string; recordType: string }) {
  if (!["FINDING", "CAPA", "RISK"].includes(recordType)) return null;
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const { data: record } = await supabase.from("records").select("title,lifecycle_status,owner_user_id").eq("id", recordId).eq("record_type", recordType).maybeSingle();
  if (!record || record.lifecycle_status !== "ACTIVE") return null;

  if (recordType === "FINDING") {
    const { data: row } = await supabase.from("findings").select("workflow_status,owner_user_id,finding_type,severity,identified_at,due_date,description,immediate_action").eq("record_id", recordId).maybeSingle();
    if (!row || !canEditQualityRecord(recordType, row.workflow_status)) return null;
    const allowed = user.permissions.includes("findings.manage") || row.owner_user_id === user.id || record.owner_user_id === user.id;
    if (!allowed) return null;
    return <QualityRecordEditClient recordId={recordId} recordType="FINDING" workflowStatus={row.workflow_status} initialValues={{
      title: record.title,
      finding_type: row.finding_type || "",
      severity: row.severity || "",
      identified_at: dateTimeLocalHcm(row.identified_at),
      due_date: row.due_date || "",
      description: row.description || "",
      immediate_action: row.immediate_action || "",
    }} />;
  }

  if (recordType === "CAPA") {
    if (!user.permissions.includes("capa.manage")) return null;
    const { data: row } = await supabase.from("capas").select("workflow_status,priority,effectiveness_due_date,approval_required,problem_statement,immediate_correction").eq("record_id", recordId).maybeSingle();
    if (!row || !canEditQualityRecord(recordType, row.workflow_status)) return null;
    return <QualityRecordEditClient recordId={recordId} recordType="CAPA" workflowStatus={row.workflow_status} initialValues={{
      title: record.title,
      priority: row.priority || "NORMAL",
      effectiveness_due_date: row.effectiveness_due_date || "",
      approval_required: !!row.approval_required,
      problem_statement: row.problem_statement || "",
      immediate_correction: row.immediate_correction || "",
    }} />;
  }

  if (!user.permissions.includes("risk.manage")) return null;
  const { data: row } = await supabase.from("risks").select("workflow_status,risk_event,cause_summary,potential_consequence,process_name,next_review_date,review_frequency").eq("record_id", recordId).maybeSingle();
  if (!row || !canEditQualityRecord(recordType, row.workflow_status)) return null;
  return <QualityRecordEditClient recordId={recordId} recordType="RISK" workflowStatus={row.workflow_status} initialValues={{
    title: record.title,
    risk_event: row.risk_event || "",
    cause_summary: row.cause_summary || "",
    potential_consequence: row.potential_consequence || "",
    process_name: row.process_name || "",
    next_review_date: row.next_review_date || "",
    review_frequency: row.review_frequency || "",
  }} />;
}
