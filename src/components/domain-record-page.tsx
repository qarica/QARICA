import Link from "next/link";
import { redirect } from "next/navigation";
import { DomainRecordDetail } from "@/components/domain-record-detail";
import { DomainWorkflowPanel } from "@/components/domain-workflow-panel";
import { IncidentLessonsLearnedClient } from "@/components/incident-lessons-learned-client";
import { IncidentPrintActions } from "@/components/incident-print-actions";
import { PageHeader } from "@/components/page-header";
import { QualityRecordEditPanel } from "@/components/quality-record-edit-panel";
import { RecordActionsPanel } from "@/components/record-actions-panel";
import { RecordCollaborationPanel } from "@/components/record-collaboration-panel";
import { RecordHistoryPanel } from "@/components/record-history-panel";
import { RecordTraceabilityPanel } from "@/components/record-traceability-panel";
import { StatusBadge } from "@/components/status-badge";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getModuleOperatingSpec } from "@/lib/module-operating-spec";
import { createClient } from "@/lib/supabase/server";

const STANDARD_PRINT_TYPES = new Set(["FINDING", "CAPA", "RISK", "AUDIT"]);

function SpecCard({ title, items }: { title: string; items: string[] }) {
  return <article className="operating-spec-card"><div className="operating-spec-title">{title}</div><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></article>;
}

function OperatingGate({ spec }: { spec: ReturnType<typeof getModuleOperatingSpec> }) {
  if (!spec) return null;
  return <section className="operating-spec-panel domain-gate-panel">
    <div className="operating-spec-head"><div><span className="module-overline">GATE NGHIỆP VỤ TỪ TÀI LIỆU NGUỒN</span><h3>Chỉ chuyển trạng thái hoặc đóng khi hồ sơ đáp ứng đủ điều kiện</h3></div></div>
    <div className="operating-spec-grid"><SpecCard title="Dữ liệu bắt buộc" items={spec.required}/><SpecCard title="Minh chứng phải giữ" items={spec.evidence}/><SpecCard title="Điều kiện đóng" items={spec.closeGate}/></div>
    {spec.cadence?.length ? <div className="operating-cadence"><strong>Nhịp / thời điểm:</strong>{spec.cadence.map((item,index)=><span key={index}>{item}</span>)}</div> : null}
    <div className="operating-source-row"><strong>Nguồn:</strong>{spec.source.map((item,index)=><span key={`${item}-${index}`}>{item}</span>)}</div>
  </section>;
}

export async function DomainRecordPage({ id, moduleTitle, listHref, permissions }: { id: string; moduleTitle: string; listHref: string; permissions: string[] }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, permissions)) redirect("/dashboard?forbidden=1");
  const supabase = await createClient();
  const { data: record } = await supabase.from("records").select("id,record_type,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at,closed_at").eq("id", id).maybeSingle();
  if (!record) return <div className="page-stack modern-module-page"><PageHeader title={moduleTitle} description="Không tìm thấy hồ sơ hoặc tài khoản hiện tại không có quyền truy cập."/><section className="panel empty-state"><Link href={listHref} className="button secondary">Quay lại danh sách</Link></section></div>;
  const [departmentResult, ownerResult] = await Promise.all([
    record.owner_department_id ? supabase.from("departments").select("name,short_name").eq("id", record.owner_department_id).maybeSingle() : Promise.resolve({ data: null }),
    record.owner_user_id ? supabase.from("profiles").select("full_name,email,job_title").eq("user_id", record.owner_user_id).maybeSingle() : Promise.resolve({ data: null }),
  ] as any);
  const department = departmentResult.data; const owner = ownerResult.data; const spec = getModuleOperatingSpec([record.record_type]);
  const isIncident = record.record_type === "INCIDENT";
  const isCapa = record.record_type === "CAPA";
  const isPriorityWorkflow = isIncident || isCapa;

  const meta = <section className="panel detail-grid domain-record-meta">
    <div><span>Loại hồ sơ</span><strong>{record.record_type}</strong></div><div><span>Trạng thái Registry</span><StatusBadge status={record.lifecycle_status} /></div>
    <div><span>Đơn vị phụ trách</span><strong>{department?.short_name || department?.name || "—"}</strong></div><div><span>Người phụ trách</span><strong>{owner?.full_name || owner?.email || "Chưa gán"}</strong></div>
    <div><span>Tạo lúc</span><strong>{formatDateTime(record.created_at)}</strong></div><div><span>Cập nhật</span><strong>{formatDateTime(record.updated_at)}</strong></div>
    {record.closed_at ? <div><span>Đóng lúc</span><strong>{formatDateTime(record.closed_at)}</strong></div> : null}
  </section>;

  return <div className="page-stack modern-module-page domain-record-page">
    {isPriorityWorkflow ? <style>{`.priority-record-stack{display:grid;gap:14px}.priority-support-details{border:1px solid #e1e9ec;border-radius:15px;background:#fff;overflow:hidden}.priority-support-details>summary{cursor:pointer;padding:15px 18px;font-weight:850;color:#334155}.priority-support-details[open]>summary{border-bottom:1px solid #e7eef0}.priority-support-body{display:grid;gap:14px;padding:14px}.priority-context{padding:12px 16px;border:1px solid #dbe7ea;border-radius:13px;background:#f8fbfc;color:#52636a;font-size:12px}.priority-context strong{color:#183b45}`}</style> : null}
    <div className="domain-record-top" style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <Link href={listHref} className="button tertiary small">← Danh sách {moduleTitle}</Link>
      {isIncident && hasAnyPermission(user,["incident.view_case","incident.triage","incident.investigate","incident.close"])?<IncidentPrintActions recordId={record.id} compact/>:null}
      {STANDARD_PRINT_TYPES.has(record.record_type)?<Link className="button secondary small" href={`${listHref}/${record.id}/print`} target="_blank">Mở bản in / PDF</Link>:null}
    </div>
    <PageHeader eyebrow={record.record_code} title={record.title} description={`${moduleTitle} · Năm ${record.work_year}`} />

    {isPriorityWorkflow ? <>
      <div className="priority-context"><strong>Ưu tiên xử lý:</strong> {isIncident ? "xem bước nghiệp vụ hiện tại trước; báo cáo gốc và audit trail vẫn được giữ nguyên. Hoàn tất điều tra/RCA và Action/CAPA áp dụng trước khi qua gate đóng." : "thực hiện theo chuỗi RCA → Corrective/Preventive Action → minh chứng → đánh giá hiệu lực → đóng. Không đóng CAPA chỉ vì Action đã hoàn tất."}</div>
      <div className="priority-record-stack">
        <DomainWorkflowPanel recordId={record.id} recordType={record.record_type} />
        <DomainRecordDetail recordType={record.record_type} recordId={record.id} />
        <QualityRecordEditPanel recordId={record.id} recordType={record.record_type} />
        <RecordActionsPanel recordId={record.id} recordType={record.record_type} sourceTitle={`${record.record_code} · ${record.title}`} />
        {isIncident ? <IncidentLessonsLearnedClient recordId={record.id} /> : null}
        <OperatingGate spec={spec} />
      </div>
      <details className="priority-support-details"><summary>Thông tin quản trị, liên kết và lịch sử hồ sơ</summary><div className="priority-support-body">{meta}<RecordTraceabilityPanel recordId={record.id} /><RecordCollaborationPanel recordId={record.id} /><RecordHistoryPanel recordId={record.id} /></div></details>
    </> : <>
      {meta}
      <DomainRecordDetail recordType={record.record_type} recordId={record.id} />
      <QualityRecordEditPanel recordId={record.id} recordType={record.record_type} />
      <DomainWorkflowPanel recordId={record.id} recordType={record.record_type} />
      <RecordActionsPanel recordId={record.id} recordType={record.record_type} sourceTitle={`${record.record_code} · ${record.title}`} />
      <RecordTraceabilityPanel recordId={record.id} />
      <RecordCollaborationPanel recordId={record.id} />
      <RecordHistoryPanel recordId={record.id} />
      <OperatingGate spec={spec} />
    </>}
  </div>;
}
