import Link from "next/link";
import { redirect } from "next/navigation";
import { DomainRecordDetail } from "@/components/domain-record-detail";
import { DomainWorkflowPanel } from "@/components/domain-workflow-panel";
import { IncidentPrintActions } from "@/components/incident-print-actions";
import { PageHeader } from "@/components/page-header";
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

  return <div className="page-stack modern-module-page domain-record-page">
    <div className="domain-record-top" style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <Link href={listHref} className="button tertiary small">← Danh sách {moduleTitle}</Link>
      {record.record_type === "INCIDENT" && hasAnyPermission(user,["incident.view_case","incident.triage","incident.investigate","incident.close"])?<IncidentPrintActions recordId={record.id} compact/>:null}
      {STANDARD_PRINT_TYPES.has(record.record_type)?<Link className="button secondary small" href={`${listHref}/${record.id}/print`} target="_blank">Mở bản in / PDF</Link>:null}
    </div>
    <PageHeader eyebrow={record.record_code} title={record.title} description={`${moduleTitle} · Năm ${record.work_year}`} />
    <section className="panel detail-grid domain-record-meta">
      <div><span>Loại hồ sơ</span><strong>{record.record_type}</strong></div><div><span>Trạng thái Registry</span><StatusBadge status={record.lifecycle_status} /></div>
      <div><span>Đơn vị phụ trách</span><strong>{department?.short_name || department?.name || "—"}</strong></div><div><span>Người phụ trách</span><strong>{owner?.full_name || owner?.email || "Chưa gán"}</strong></div>
      <div><span>Tạo lúc</span><strong>{formatDateTime(record.created_at)}</strong></div><div><span>Cập nhật</span><strong>{formatDateTime(record.updated_at)}</strong></div>
      {record.closed_at ? <div><span>Đóng lúc</span><strong>{formatDateTime(record.closed_at)}</strong></div> : null}
    </section>
    <DomainRecordDetail recordType={record.record_type} recordId={record.id} />
    <DomainWorkflowPanel recordId={record.id} recordType={record.record_type} />
    <RecordActionsPanel recordId={record.id} recordType={record.record_type} sourceTitle={`${record.record_code} · ${record.title}`} />
    <RecordTraceabilityPanel recordId={record.id} />
    <RecordCollaborationPanel recordId={record.id} />
    <RecordHistoryPanel recordId={record.id} />
    {spec ? <section className="operating-spec-panel domain-gate-panel">
      <div className="operating-spec-head"><div><span className="module-overline">GATE NGHIỆP VỤ TỪ TÀI LIỆU NGUỒN</span><h3>Chỉ chuyển trạng thái hoặc đóng khi hồ sơ đáp ứng đủ điều kiện</h3></div></div>
      <div className="operating-spec-grid"><SpecCard title="Dữ liệu bắt buộc" items={spec.required}/><SpecCard title="Minh chứng phải giữ" items={spec.evidence}/><SpecCard title="Điều kiện đóng" items={spec.closeGate}/></div>
      {spec.cadence?.length ? <div className="operating-cadence"><strong>Nhịp / thời điểm:</strong>{spec.cadence.map((item,index)=><span key={index}>{item}</span>)}</div> : null}
      <div className="operating-source-row"><strong>Nguồn:</strong>{spec.source.map((item,index)=><span key={`${item}-${index}`}>{item}</span>)}</div>
    </section> : null}
  </div>;
}
