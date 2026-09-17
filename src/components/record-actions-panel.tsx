import Link from "next/link";
import { RecordActionCreateClient } from "@/components/record-action-create-client";
import { StatusBadge } from "@/components/status-badge";
import { requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import { canCreateLinkedAction } from "@/lib/source-action-policy";
import { createClient } from "@/lib/supabase/server";

const PRIORITY: Record<string, string> = { LOW: "Thấp", NORMAL: "Bình thường", HIGH: "Cao", URGENT: "Khẩn", CRITICAL: "Rất khẩn" };

type FmeaModeOption = { id: string; label: string; high: boolean };

export async function RecordActionsPanel({ recordId, recordType, sourceTitle }: { recordId: string; recordType: string; sourceTitle: string }) {
  const { user } = await requireUserContext();
  const supabase = await createClient();
  const canCreate = canCreateLinkedAction(user.permissions, recordType);
  const { data: links } = await supabase.from("record_links").select("target_record_id,relation_type,created_at").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION").order("created_at", { ascending: false });
  const targetIds = Array.from(new Set((links ?? []).map((row: any) => String(row.target_record_id || "")).filter(Boolean)));
  const [recordRes, actionRes, departmentsRes, profilesRes] = await Promise.all([
    targetIds.length ? supabase.from("records").select("id,record_code,title,lifecycle_status,owner_department_id,owner_user_id").in("id", targetIds).eq("record_type", "ACTION") : Promise.resolve({ data: [], error: null }),
    targetIds.length ? supabase.from("actions").select("record_id,priority,due_date,workflow_status").in("record_id", targetIds) : Promise.resolve({ data: [], error: null }),
    canCreate ? supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
    canCreate ? supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }) : Promise.resolve({ data: [], error: null }),
  ] as any);

  let failureModes: FmeaModeOption[] = [];
  if (canCreate && recordType === "FMEA") {
    const { data: study } = await supabase.from("fmea_studies").select("id").eq("record_id", recordId).maybeSingle();
    if (study?.id) {
      const { data: steps } = await supabase.from("fmea_process_steps").select("id,step_no,step_name").eq("fmea_study_id", study.id).order("step_no");
      const stepRows = (steps ?? []) as any[];
      const stepIds = stepRows.map((x) => x.id);
      if (stepIds.length) {
        const { data: modes } = await supabase.from("fmea_failure_modes").select("id,process_step_id,failure_mode,is_high_priority").in("process_step_id", stepIds);
        const stepMap = new Map(stepRows.map((x) => [String(x.id), `${x.step_no}. ${x.step_name}`]));
        failureModes = ((modes ?? []) as any[]).map((x) => ({ id: String(x.id), label: `${stepMap.get(String(x.process_step_id)) || "Bước"} · ${x.failure_mode}`, high: !!x.is_high_priority })).sort((a, b) => Number(b.high) - Number(a.high) || a.label.localeCompare(b.label, "vi"));
      }
    }
  }

  const actionMap = new Map<string, any>(); for (const a of (actionRes.data ?? []) as any[]) actionMap.set(String(a.record_id), a);
  const departmentMap = new Map<string, string>(); for (const d of (departmentsRes.data ?? []) as any[]) departmentMap.set(String(d.id), String(d.short_name || d.name || "—"));
  const profileMap = new Map<string, string>(); for (const p of (profilesRes.data ?? []) as any[]) profileMap.set(String(p.user_id), String(p.full_name || p.email || "Người dùng"));
  const rows = ((recordRes.data ?? []) as any[])
    .filter((record: any) => !isOperationallyHiddenStatus(record.lifecycle_status) && actionMap.get(String(record.id))?.workflow_status !== "CANCELLED")
    .map((record: any) => ({ ...record, action: actionMap.get(String(record.id)) }));

  return <section className="panel linked-actions-panel">
    <style>{`.linked-actions-panel .lap-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;padding:18px 19px 12px}.linked-actions-panel .lap-head h2{margin:0;font-size:19px}.linked-actions-panel .lap-head p{margin:5px 0 0;color:#64757b;font-size:13px;line-height:1.45}.linked-actions-panel .lap-list{display:grid;padding:0 18px 18px;gap:9px}.linked-actions-panel .lap-row{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(130px,.8fr) 100px 110px 130px auto;gap:10px;align-items:center;border:1px solid #dfe8ea;border-radius:12px;padding:11px 12px;background:#fff}.linked-actions-panel .lap-title{font-weight:750;line-height:1.35}.linked-actions-panel .lap-code{font-size:10px;color:#718087;margin-top:3px;font-weight:800}.linked-actions-panel .lap-meta{font-size:12px;color:#54666c}.linked-actions-panel .lap-empty{padding:18px;border:1px dashed #cad8db;border-radius:12px;color:#6d7e84;font-size:13px;background:#fbfdfd}@media(max-width:900px){.linked-actions-panel .lap-row{grid-template-columns:1fr 1fr}.linked-actions-panel .lap-main{grid-column:1/-1}.linked-actions-panel .lap-row>a{grid-column:1/-1;width:max-content}}@media(max-width:580px){.linked-actions-panel .lap-row{grid-template-columns:1fr}.linked-actions-panel .lap-main,.linked-actions-panel .lap-row>a{grid-column:auto}.linked-actions-panel .lap-head .button{width:100%;justify-content:center}}`}</style>
    <div className="lap-head"><div><h2>Hành động / nhiệm vụ liên kết</h2><p>{recordType === "FMEA" ? "Mỗi Action FMEA phải gắn với một failure mode cụ thể để theo dõi can thiệp và residual risk." : "Biến yêu cầu, phát hiện hoặc vấn đề trong hồ sơ thành Action có owner, deadline, minh chứng và bước xác minh. Action đã hủy được tách khỏi màn hình vận hành."}</p></div>{canCreate ? <RecordActionCreateClient recordId={recordId} recordType={recordType} sourceTitle={sourceTitle} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} failureModes={failureModes} /> : null}</div>
    <div className="lap-list">{rows.length ? rows.map((row: any) => <div className="lap-row" key={row.id}><div className="lap-main"><div className="lap-title">{row.title}</div><div className="lap-code">{row.record_code}</div></div><div className="lap-meta"><strong>{departmentMap.get(String(row.owner_department_id)) || "—"}</strong><br />{profileMap.get(String(row.owner_user_id)) || "Chưa gán"}</div><div className="lap-meta">{PRIORITY[row.action?.priority] || row.action?.priority || "—"}</div><div className="lap-meta">{formatDate(row.action?.due_date)}</div><div><StatusBadge status={row.lifecycle_status !== "ACTIVE" ? row.lifecycle_status : row.action?.workflow_status || "NOT_STARTED"} /></div><Link className="button tertiary small" href={`/tasks/${row.id}`}>Mở công việc</Link></div>) : <div className="lap-empty">Chưa có Action đang hoạt động. Khi cần giao việc cụ thể, tạo Action tại đây để giữ đầy đủ quan hệ nguồn → hành động → minh chứng → xác minh.</div>}</div>
  </section>;
}
