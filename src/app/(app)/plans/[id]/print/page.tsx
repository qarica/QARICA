import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlanPrintActions } from "@/components/plan-print-actions";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, string> = { ANNUAL_PLAN: "Kế hoạch năm", THEMATIC_PLAN: "Kế hoạch chuyên đề", DEPARTMENT_PLAN: "Kế hoạch khoa/phòng", PROGRAM: "Chương trình", OTHER: "Khác" };

function text(value: unknown) { const s = String(value ?? "").trim(); return s || "—"; }

export default async function PlanPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, organization } = await requireUserContext();
  if (!hasAnyPermission(user, ["plans.view", "plans.manage"])) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const supabase = await createClient();

  const { data: program } = await supabase.from("work_programs")
    .select("id,record_id,program_type,description,general_objective,specific_objectives,requirements,draft_actions,start_date,end_date,lead_department_id,owner_user_id,workflow_status,approved_by,approved_at,revision_no")
    .eq("id", id).maybeSingle();
  if (!program) notFound();

  const [{ data: record }, { data: department }, { data: owner }, { data: approver }, { data: links }] = await Promise.all([
    supabase.from("records").select("id,record_code,title,work_year,created_at").eq("id", program.record_id).maybeSingle(),
    program.lead_department_id ? supabase.from("departments").select("name,short_name").eq("id", program.lead_department_id).maybeSingle() : Promise.resolve({ data: null }),
    program.owner_user_id ? supabase.from("profiles").select("full_name,email,job_title").eq("user_id", program.owner_user_id).maybeSingle() : Promise.resolve({ data: null }),
    program.approved_by ? supabase.from("profiles").select("full_name,email").eq("user_id", program.approved_by).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("program_action_links").select("action_id,milestone_group,sequence_no").eq("program_id", id).order("sequence_no", { ascending: true, nullsFirst: false }),
  ] as any);
  if (!record) notFound();

  const actionIds = (links ?? []).map((x: any) => x.action_id);
  const [{ data: actionRecords }, { data: actionRows }] = actionIds.length ? await Promise.all([
    supabase.from("records").select("id,record_code,title,owner_department_id,owner_user_id").in("id", actionIds),
    supabase.from("actions").select("record_id,start_date,due_date,expected_result").in("record_id", actionIds),
  ]) : [{ data: [] }, { data: [] }] as any;
  const actionRowMap = new Map((actionRows ?? []).map((x: any) => [x.record_id, x]));
  const printableActions = (actionRecords ?? []).map((x: any) => ({ ...x, ...(actionRowMap.get(x.id) || {}) }));

  const isDraftBundle = program.workflow_status === "DRAFT" || program.workflow_status === "PENDING_APPROVAL";
  const draftTasks: any[] = isDraftBundle && Array.isArray(program.draft_actions) ? program.draft_actions : [];
  const specifics: string[] = Array.isArray(program.specific_objectives) ? program.specific_objectives : [];
  const generatedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  return <div className="plan-print-page">
    <style>{`
      .plan-print-page{max-width:980px;margin:0 auto;background:#fff;color:#111827;padding:26px;box-shadow:0 8px 24px rgba(15,23,42,.08);font-family:"Times New Roman",Times,serif}
      .ppr-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px;font-family:Arial,sans-serif}.ppr-toolbar a{text-decoration:none;color:#0f766e;font-weight:750}
      .ppr-letterhead{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:6px}
      .ppr-letterhead .org{font-weight:800;text-transform:uppercase;font-size:13px}.ppr-letterhead .org small{display:block;font-weight:600;font-size:12px;margin-top:2px}
      .ppr-letterhead .nation{font-weight:800;font-size:13px}.ppr-letterhead .nation .slogan{font-weight:700;text-decoration:underline;margin-top:2px;font-size:13px}
      .ppr-code{text-align:center;font-style:italic;font-size:12.5px;margin:2px 0 18px}
      .ppr-title{text-align:center;margin:6px 0 4px}.ppr-title h1{font-size:19px;font-weight:800;text-transform:uppercase;margin:0}.ppr-title h2{font-size:16px;font-weight:800;text-transform:uppercase;margin:4px 0 0}
      .ppr-meta{text-align:center;font-size:12.5px;color:#334155;margin-bottom:20px}
      .ppr-section{margin:14px 0;break-inside:avoid;font-size:13px;line-height:1.6}.ppr-section h3{font-size:13.5px;font-weight:800;margin:0 0 6px;text-transform:uppercase}
      .ppr-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d7dee8;border-bottom:0;font-family:Arial,sans-serif;font-size:12px}
      .ppr-row{display:grid;grid-template-columns:150px 1fr;min-height:36px;border-bottom:1px solid #d7dee8}.ppr-row:nth-child(odd){border-right:1px solid #d7dee8}.ppr-row.wide{grid-column:1/-1;border-right:0}
      .ppr-row span{padding:8px;background:#f8fafc;color:#475569;border-right:1px solid #d7dee8}.ppr-row strong{padding:8px;white-space:pre-wrap;font-weight:650}
      .ppr-list{margin:6px 0 0;padding-left:22px}.ppr-list li{margin-bottom:4px}
      .ppr-table{width:100%;border-collapse:collapse;font-size:11px;font-family:Arial,sans-serif;margin-top:6px}.ppr-table th,.ppr-table td{border:1px solid #d7dee8;padding:6px;text-align:left;vertical-align:top;white-space:pre-wrap}.ppr-table th{background:#f8fafc}
      .ppr-sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:34px;font-size:12.5px;text-align:center}
      .ppr-sign .box{min-height:120px}.ppr-sign .role{font-weight:800;text-transform:uppercase}.ppr-sign .hint{font-style:italic;color:#475569;font-size:11.5px;margin-top:2px}
      .ppr-note{font-size:10px;color:#64748b;line-height:1.45;margin-top:20px;font-family:Arial,sans-serif}
      .ppr-footer{margin-top:10px;padding-top:8px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;font-size:10px;color:#64748b;font-family:Arial,sans-serif}
      @media(max-width:760px){.plan-print-page{padding:15px}.ppr-letterhead{grid-template-columns:1fr}.ppr-grid{grid-template-columns:1fr}.ppr-row:nth-child(odd){border-right:0}.ppr-row{grid-template-columns:125px 1fr}.ppr-sign{grid-template-columns:1fr}}
      @media print{
        @page{size:A4;margin:15mm 20mm}
        body{background:#fff!important}.sidebar,.topbar,.workspace-strip,.mobile-bottom-nav,.global-back-bar,.route-progress,.no-print{display:none!important}.main-shell{margin:0!important;padding:0!important}.content{padding:0!important;margin:0!important;max-width:none!important}
        .plan-print-page{box-shadow:none!important;max-width:none!important;margin:0!important;padding:0!important}.ppr-section{break-inside:avoid}.ppr-sign{break-inside:avoid}
      }
    `}</style>

    <div className="ppr-toolbar no-print"><Link href={`/plans/${id}`}>← Quay lại kế hoạch</Link><PlanPrintActions planId={id} /></div>

    <div className="ppr-letterhead">
      <div className="org">{organization?.name || "BỆNH VIỆN"}<small>Số: {record.record_code}</small></div>
      <div className="nation">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<div className="slogan">Độc lập – Tự do – Hạnh phúc</div></div>
    </div>
    <p className="ppr-code">TP. Hồ Chí Minh, ngày ...... tháng ...... năm {record.work_year}</p>

    <div className="ppr-title">
      <h1>Kế hoạch</h1>
      <h2>{record.title}</h2>
    </div>
    <p className="ppr-meta">{TYPE_LABELS[program.program_type] || program.program_type} · Năm {record.work_year} · Thời gian thực hiện: {formatDate(program.start_date)} – {formatDate(program.end_date)}</p>

    <section className="ppr-section">
      <h3>I. Mục tiêu chung</h3>
      <p style={{ margin: 0 }}>{text(program.general_objective || program.description)}</p>
    </section>

    <section className="ppr-section">
      <h3>II. Mục tiêu cụ thể</h3>
      {specifics.length ? <ol className="ppr-list">{specifics.map((s, i) => <li key={i}>{s}</li>)}</ol> : <p style={{ margin: 0 }}>Chưa cập nhật.</p>}
    </section>

    <section className="ppr-section">
      <h3>III. Yêu cầu</h3>
      <p style={{ margin: 0 }}>{text(program.requirements)}</p>
    </section>

    <section className="ppr-section">
      <h3>IV. Đơn vị chủ trì và phân công</h3>
      <div className="ppr-grid">
        <div className="ppr-row"><span>Khoa/phòng chủ trì</span><strong>{(department as any)?.short_name || (department as any)?.name || "—"}</strong></div>
        <div className="ppr-row"><span>Người phụ trách</span><strong>{(owner as any)?.full_name || (owner as any)?.email || "—"}</strong></div>
      </div>
    </section>

    <section className="ppr-section">
      <h3>V. Danh sách nhiệm vụ / hành động</h3>
      {printableActions.length ? <table className="ppr-table"><thead><tr><th>Mã</th><th>Nội dung</th><th>Kết quả kỳ vọng</th><th>Ngày bắt đầu</th><th>Hạn hoàn thành</th></tr></thead><tbody>
        {printableActions.map((a: any) => <tr key={a.id}><td>{a.record_code}</td><td>{a.title}</td><td>{text(a.expected_result)}</td><td>{formatDate(a.start_date)}</td><td>{formatDate(a.due_date)}</td></tr>)}
      </tbody></table> : draftTasks.length ? <table className="ppr-table"><thead><tr><th>Nội dung (nháp – chưa phê duyệt)</th><th>Kết quả kỳ vọng</th><th>Ngày bắt đầu</th><th>Hạn hoàn thành</th></tr></thead><tbody>
        {draftTasks.map((t: any, i: number) => <tr key={i}><td>{text(t.title)}</td><td>{text(t.expected_result)}</td><td>{t.start_date ? formatDate(t.start_date) : "—"}</td><td>{t.due_date ? formatDate(t.due_date) : "—"}</td></tr>)}
      </tbody></table> : <p style={{ margin: 0 }}>Chưa có nhiệm vụ nào.</p>}
      {isDraftBundle && draftTasks.length ? <p style={{ fontSize: 11, fontStyle: "italic", color: "#64748b", marginTop: 6 }}>* Danh sách nhiệm vụ ở dạng nháp, sẽ được tạo thành hồ sơ Action chính thức sau khi kế hoạch được phê duyệt trên hệ thống.</p> : null}
    </section>

    <div className="ppr-sign">
      <div className="box"><div className="role">Người lập kế hoạch</div><div className="hint">(Ký, ghi rõ họ tên)</div></div>
      <div className="box"><div className="role">Giám đốc phê duyệt</div><div className="hint">(Ký, ghi rõ họ tên)</div>{(approver as any)?.full_name ? <div style={{ marginTop: 60, fontWeight: 700 }}>{(approver as any).full_name}</div> : null}</div>
    </div>

    <p className="ppr-note">Bản in này được xuất từ hệ thống Quản lý chất lượng điện tử tại thời điểm xuất, dùng để trình ký bản giấy song song với việc theo dõi tiến độ trên hệ thống. Sau khi ký giấy, bản gốc lưu tại Phòng KHTH – QLCL theo quy định lưu trữ hồ sơ.</p>
    <footer className="ppr-footer"><span>Xuất lúc: {generatedAt}</span><span>Người xuất: {user.fullName || user.email}</span></footer>
  </div>;
}
