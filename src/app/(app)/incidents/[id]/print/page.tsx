import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IncidentPrintActions } from "@/components/incident-print-actions";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const HARM: Record<string,string> = { NEAR_MISS:"Near-miss", NO_HARM:"Không tổn hại", MILD:"Nhẹ", MODERATE:"Trung bình", SEVERE:"Nặng", DEATH:"Tử vong" };
const STATUS: Record<string,string> = { REPORTED:"Mới báo cáo", RETURNED:"Cần bổ sung", TRIAGED:"Đã xác minh", INVESTIGATION_REQUIRED:"Cần điều tra", INVESTIGATING:"Đang điều tra", ACTION_FOLLOW_UP:"Theo dõi hành động", AWAITING_CLOSURE:"Chờ đóng", CLOSED:"Đã đóng" };
const REPORT_TYPE: Record<string,string> = { VOLUNTARY:"Tự nguyện", MANDATORY:"Bắt buộc" };

function text(value: unknown) { const s = String(value ?? "").trim(); return s || "—"; }
function yesNo(value: unknown) { return value ? "Có" : "Không"; }
function Row({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) { return <div className={wide ? "ipr-row wide" : "ipr-row"}><span>{label}</span><strong>{value}</strong></div>; }

export default async function IncidentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, organization } = await requireUserContext();
  if (!hasAnyPermission(user, ["incident.view_case", "incident.triage", "incident.investigate", "incident.close"])) redirect("/dashboard?forbidden=1");
  const { id: recordId } = await params;
  const supabase = await createClient();
  const { data: record } = await supabase.from("records").select("id,record_code,title,work_year,lifecycle_status,owner_department_id,created_at,updated_at,closed_at").eq("id", recordId).eq("record_type", "INCIDENT").maybeSingle();
  if (!record) notFound();
  const { data: incident } = await supabase.from("incidents").select("id,occurred_at,detected_at,reported_at,incident_location_department_id,incident_location_text,summary,verified_description,harm_status,serious_event_flag,workflow_status,investigation_required,rca_required,closed_at").eq("record_id", recordId).maybeSingle();
  if (!incident) notFound();

  const [{ data: report }, { data: investigation }, { data: department }, { data: actions }, { count: evidenceCount }] = await Promise.all([
    supabase.from("incident_reports").select("report_type,reporter_name_snapshot,reporter_department_name_snapshot,reporter_identity_confidential,initial_description,initial_harm_assessment,initial_response_description,patient_name,patient_code,mandatory_report_flag,created_at").eq("incident_id", incident.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("incident_investigations").select("investigation_type,started_at,completed_at,verified_event_summary,harm_conclusion,rca_required,conclusion,status").eq("incident_id", incident.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    incident.incident_location_department_id ? supabase.from("departments").select("name,short_name").eq("id", incident.incident_location_department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "HAS_ACTION"),
    supabase.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
  ] as any);

  const actionIds = (actions ?? []).map((x: any) => x.target_record_id).filter(Boolean);
  const [{ data: actionRecords }, { data: actionRows }] = actionIds.length ? await Promise.all([
    supabase.from("records").select("id,record_code,title").in("id", actionIds),
    supabase.from("actions").select("record_id,workflow_status,due_date,priority").in("record_id", actionIds),
  ]) : [{ data: [] }, { data: [] }] as any;
  const actionMap = new Map((actionRows ?? []).map((x: any) => [x.record_id, x]));
  const printableActions = (actionRecords ?? []).map((x: any) => ({ ...x, ...(actionMap.get(x.id) || {}) }));

  const generatedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const locationDepartment = department?.short_name || department?.name || "—";
  const reporterIdentity = report?.reporter_identity_confidential ? "Được bảo mật theo hồ sơ" : text(report?.reporter_name_snapshot);

  return <div className="incident-print-page">
    <style>{`
      .incident-print-page{max-width:980px;margin:0 auto;background:#fff;color:#111827;padding:26px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
      .ipr-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px}.ipr-toolbar a{text-decoration:none;color:#0f766e;font-weight:750}
      .ipr-header{display:grid;grid-template-columns:1fr auto;gap:18px;border-bottom:2px solid #0f766e;padding-bottom:14px;margin-bottom:16px}.ipr-org{font-size:13px;font-weight:800;text-transform:uppercase}.ipr-title{font-size:24px;font-weight:900;margin-top:6px}.ipr-code{text-align:right;font-weight:850;font-size:14px}.ipr-code small{display:block;font-weight:600;color:#64748b;margin-top:4px}
      .ipr-section{margin:16px 0;break-inside:avoid}.ipr-section h2{font-size:15px;margin:0 0 8px;padding:8px 10px;background:#ecfdf5;border-left:4px solid #0f766e}.ipr-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d7dee8;border-bottom:0}.ipr-row{display:grid;grid-template-columns:150px 1fr;min-height:42px;border-bottom:1px solid #d7dee8}.ipr-row:nth-child(odd){border-right:1px solid #d7dee8}.ipr-row.wide{grid-column:1/-1;border-right:0}.ipr-row span{padding:9px;background:#f8fafc;color:#475569;font-size:12px;border-right:1px solid #d7dee8}.ipr-row strong{padding:9px;font-size:12px;white-space:pre-wrap;font-weight:650;line-height:1.45}
      .ipr-table{width:100%;border-collapse:collapse;font-size:11px}.ipr-table th,.ipr-table td{border:1px solid #d7dee8;padding:7px;text-align:left;vertical-align:top}.ipr-table th{background:#f8fafc}.ipr-note{font-size:10px;color:#64748b;line-height:1.45;margin-top:14px}.ipr-footer{margin-top:24px;padding-top:10px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;gap:20px;font-size:10px;color:#64748b}
      @media(max-width:760px){.incident-print-page{padding:15px}.ipr-header{grid-template-columns:1fr}.ipr-code{text-align:left}.ipr-grid{grid-template-columns:1fr}.ipr-row:nth-child(odd){border-right:0}.ipr-row{grid-template-columns:125px 1fr}}
      @media print{
        @page{size:A4;margin:12mm}
        body{background:#fff!important}.sidebar,.topbar,.workspace-strip,.mobile-bottom-nav,.global-back-bar,.route-progress,.no-print{display:none!important}.main-shell{margin:0!important;padding:0!important}.content{padding:0!important;margin:0!important;max-width:none!important}.incident-print-page{box-shadow:none!important;max-width:none!important;margin:0!important;padding:0!important}.ipr-section{break-inside:avoid}.ipr-title{font-size:20px}.ipr-row span,.ipr-row strong{font-size:10.5px}.ipr-table{font-size:9.5px}
      }
    `}</style>
    <div className="ipr-toolbar no-print"><Link href={`/incidents/${recordId}`}>← Quay lại hồ sơ sự cố</Link><IncidentPrintActions recordId={recordId} /></div>

    <header className="ipr-header"><div><div className="ipr-org">{organization?.name || "HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG"}</div><div className="ipr-title">PHIẾU TỔNG HỢP BÁO CÁO SỰ CỐ Y KHOA</div></div><div className="ipr-code">{record.record_code}<small>Năm {record.work_year}</small></div></header>

    <section className="ipr-section"><h2>1. Thông tin hành chính của hồ sơ</h2><div className="ipr-grid">
      <Row label="Mã hồ sơ" value={record.record_code}/><Row label="Trạng thái" value={STATUS[incident.workflow_status] || incident.workflow_status}/>
      <Row label="Tên hồ sơ" value={record.title} wide/><Row label="Khoa/phòng xảy ra" value={locationDepartment}/><Row label="Vị trí cụ thể" value={text(incident.incident_location_text)}/>
      <Row label="Thời điểm xảy ra" value={incident.occurred_at ? formatDateTime(incident.occurred_at) : "—"}/><Row label="Thời điểm phát hiện" value={incident.detected_at ? formatDateTime(incident.detected_at) : "—"}/>
      <Row label="Thời điểm báo cáo" value={incident.reported_at ? formatDateTime(incident.reported_at) : "—"}/><Row label="Cập nhật hồ sơ" value={formatDateTime(record.updated_at)}/>
    </div></section>

    <section className="ipr-section"><h2>2. Nội dung báo cáo ban đầu — giữ nguyên theo người báo cáo</h2><div className="ipr-grid">
      <Row label="Hình thức báo cáo" value={REPORT_TYPE[report?.report_type] || text(report?.report_type)}/><Row label="Người báo cáo" value={reporterIdentity}/>
      <Row label="Đơn vị người báo cáo" value={text(report?.reporter_department_name_snapshot)}/><Row label="Bảo mật danh tính" value={yesNo(report?.reporter_identity_confidential)}/>
      <Row label="Mã người bệnh" value={text(report?.patient_code)}/><Row label="Người bệnh" value={text(report?.patient_name)}/>
      <Row label="Mô tả ban đầu" value={text(report?.initial_description || incident.summary)} wide/><Row label="Đánh giá ảnh hưởng ban đầu" value={text(report?.initial_harm_assessment)} wide/><Row label="Xử trí tức thời" value={text(report?.initial_response_description)} wide/>
    </div></section>

    <section className="ipr-section"><h2>3. Kết quả xác minh và phân loại của QLCL</h2><div className="ipr-grid">
      <Row label="Mức tổn hại" value={HARM[incident.harm_status] || text(incident.harm_status)}/><Row label="Sự cố nghiêm trọng" value={yesNo(incident.serious_event_flag)}/>
      <Row label="Cần điều tra" value={yesNo(incident.investigation_required)}/><Row label="Cần RCA" value={yesNo(incident.rca_required)}/>
      <Row label="Mô tả đã xác minh" value={text(incident.verified_description)} wide/>
    </div></section>

    <section className="ipr-section"><h2>4. Điều tra / RCA gần nhất</h2><div className="ipr-grid">
      <Row label="Loại điều tra" value={text(investigation?.investigation_type)}/><Row label="Trạng thái điều tra" value={text(investigation?.status)}/>
      <Row label="Bắt đầu" value={investigation?.started_at ? formatDateTime(investigation.started_at) : "—"}/><Row label="Hoàn tất" value={investigation?.completed_at ? formatDateTime(investigation.completed_at) : "—"}/>
      <Row label="RCA yêu cầu" value={yesNo(investigation?.rca_required)}/><Row label="Minh chứng liên kết" value={String(evidenceCount ?? 0)}/>
      <Row label="Sự kiện đã xác minh" value={text(investigation?.verified_event_summary)} wide/><Row label="Kết luận tổn hại" value={text(investigation?.harm_conclusion)} wide/><Row label="Kết luận điều tra/RCA" value={text(investigation?.conclusion)} wide/>
    </div></section>

    <section className="ipr-section"><h2>5. Hành động khắc phục / phòng ngừa liên kết</h2>{printableActions.length ? <table className="ipr-table"><thead><tr><th>Mã</th><th>Hành động</th><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái</th></tr></thead><tbody>{printableActions.map((action:any)=><tr key={action.id}><td>{action.record_code}</td><td>{action.title}</td><td>{text(action.priority)}</td><td>{text(action.due_date)}</td><td>{text(action.workflow_status)}</td></tr>)}</tbody></table> : <div className="ipr-grid"><Row label="Hành động" value="Chưa có Action liên kết" wide/></div>}</section>

    <section className="ipr-section"><h2>6. Trạng thái kết thúc hồ sơ</h2><div className="ipr-grid">
      <Row label="Registry" value={record.lifecycle_status}/><Row label="Workflow sự cố" value={STATUS[incident.workflow_status] || incident.workflow_status}/>
      <Row label="Đóng lúc" value={incident.closed_at || record.closed_at ? formatDateTime(incident.closed_at || record.closed_at) : "—"}/><Row label="Số minh chứng" value={String(evidenceCount ?? 0)}/>
    </div></section>

    <p className="ipr-note">Lưu ý: Phiếu này là bản tổng hợp từ dữ liệu hồ sơ điện tử tại thời điểm xuất. Nội dung báo cáo ban đầu được trình bày tách biệt với kết quả xác minh/điều tra để bảo toàn lời báo cáo gốc và audit trail. Các trường không có dữ liệu hiển thị “—”; hệ thống không tự suy diễn hoặc bổ sung thông tin.</p>
    <footer className="ipr-footer"><span>Xuất lúc: {generatedAt}</span><span>Người xuất: {user.fullName || user.email}</span></footer>
  </div>;
}
