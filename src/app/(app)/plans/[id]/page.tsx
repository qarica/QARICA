import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PlanActionCreateClient } from "@/components/plan-action-create-client";
import { PlanDraftEditorClient } from "@/components/plan-draft-editor-client";
import { PlanWorkflowClient } from "@/components/plan-workflow-client";
import { StatusBadge } from "@/components/status-badge";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { cleanPlanDraftActions, cleanPlanList, planComposerReady } from "@/lib/plan-composer";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, string> = {
  ANNUAL_PLAN: "Kế hoạch năm",
  THEMATIC_PLAN: "Kế hoạch chuyên đề",
  DEPARTMENT_PLAN: "Kế hoạch khoa/phòng",
  PROGRAM: "Chương trình",
  OTHER: "Khác",
};

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["plans.view", "plans.manage"])) redirect("/dashboard?forbidden=1");

  const { id } = await params;
  const supabase = await createClient();
  const { data: program, error: programError } = await supabase
    .from("work_programs")
    .select("id,record_id,program_type,parent_program_id,description,objective,general_objective,specific_objectives,requirements,draft_actions,revision_no,returned_reason,returned_at,submitted_at,start_date,end_date,lead_department_id,owner_user_id,workflow_status,approved_by,approved_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (programError) return <div className="alert error">Không tải được kế hoạch: {programError.message}</div>;
  if (!program) notFound();

  const [recordRes, progressRes, departmentRes, ownerRes, approverRes, linksRes, departmentsRes, profilesRes] = await Promise.all([
    supabase.from("records").select("id,record_code,title,work_year,lifecycle_status,created_by,created_at,updated_at").eq("id", program.record_id).maybeSingle(),
    supabase.from("vw_program_progress").select("program_id,required_actions,completed_actions,progress_pct,overdue_actions").eq("program_id", id).maybeSingle(),
    program.lead_department_id ? supabase.from("departments").select("id,name,short_name").eq("id", program.lead_department_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    program.owner_user_id ? supabase.from("profiles").select("user_id,full_name,email,job_title").eq("user_id", program.owner_user_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    program.approved_by ? supabase.from("profiles").select("user_id,full_name,email").eq("user_id", program.approved_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("program_action_links").select("action_id,relation_type,weight,sequence_no,milestone_group,is_required").eq("program_id", id).order("sequence_no", { ascending: true, nullsFirst: false }),
    supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  if (!recordRes.data) notFound();

  const specificObjectives = cleanPlanList(program.specific_objectives);
  const draftActions = cleanPlanDraftActions(program.draft_actions);
  const generalObjective = String(program.general_objective || program.objective || "");
  const requirements = String(program.requirements || "");
  const composerReady = planComposerReady({ generalObjective, specificObjectives, requirements, draftActions });

  const actionIds = (linksRes.data ?? []).map((x: any) => x.action_id);
  const actionsRes = actionIds.length
    ? await supabase.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,workflow_status,priority,due_date,is_overdue,days_to_due,lead_department_id,assignee_user_id").in("action_id", actionIds)
    : { data: [], error: null };
  const actionMap = new Map((actionsRes.data ?? []).map((a: any) => [a.action_id, a]));
  const linkedActions = (linksRes.data ?? []).map((link: any) => ({ ...link, action: actionMap.get(link.action_id) as any })).filter((x: any) => x.action);

  const progress = progressRes.data as any;
  const pct = Math.max(0, Math.min(100, Math.round(Number(progress?.progress_pct ?? 0))));
  const requiredActions = Number(progress?.required_actions ?? 0);
  const completedActions = Number(progress?.completed_actions ?? 0);
  const canManage = user.permissions.includes("plans.manage");
  const firstError = [recordRes, progressRes, departmentRes as any, ownerRes as any, approverRes as any, linksRes, departmentsRes, profilesRes, actionsRes as any].find((r: any) => r?.error)?.error;
  const deptMap = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.short_name || d.name]));
  const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || "Người dùng"]));

  return <div className="page-stack plan-detail-page">
    <style>{`
      @media(max-width:760px){
        .plan-detail-page{gap:10px!important}.plan-detail-page .page-header h1{font-size:23px!important;line-height:1.22!important}.plan-detail-page .page-header p{font-size:13px!important;line-height:1.45!important}.plan-detail-page .page-header .button{min-height:40px!important}
        .plan-detail-page .kpi-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}.plan-detail-page .kpi-card{min-height:90px!important;padding:11px!important}.plan-detail-page .kpi-card>span{font-size:10px!important}.plan-detail-page .kpi-card>strong{font-size:24px!important}.plan-detail-page .kpi-card>small{font-size:9.5px!important;line-height:1.25!important}
        .plan-detail-page .chart-grid{grid-template-columns:1fr!important;gap:10px!important}.plan-detail-page .panel{border-radius:16px!important;overflow:visible!important}.plan-detail-page .panel-title{padding:14px!important;gap:10px!important;align-items:flex-start!important;flex-wrap:wrap!important}.plan-detail-page .panel-title h2{font-size:18px!important}.plan-detail-page .panel-title p{font-size:12px!important;line-height:1.4!important}
        .plan-detail-page .form-grid.two{grid-template-columns:1fr!important;gap:13px!important}.plan-detail-page .span-2{grid-column:auto!important}.plan-detail-page .table-wrap{overflow:visible!important;padding:0 10px 10px!important}.plan-detail-page table,.plan-detail-page tbody{display:block!important;width:100%!important}.plan-detail-page thead{display:none!important}
        .plan-detail-page tbody tr{display:block!important;margin:0 0 10px!important;border:1px solid #dce6e7!important;border-radius:14px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 3px 12px rgba(25,51,58,.035)}.plan-detail-page tbody td{display:grid!important;grid-template-columns:82px minmax(0,1fr)!important;gap:9px!important;align-items:start!important;width:auto!important;padding:8px 11px!important;border:0!important;border-bottom:1px solid #eef2f3!important;white-space:normal!important;min-width:0!important;font-size:13px!important;line-height:1.38!important}
        .plan-detail-page tbody td:last-child{border-bottom:0!important}.plan-detail-page tbody td::before{font-size:9px!important;font-weight:800!important;letter-spacing:.06em!important;color:#77868b!important;text-transform:uppercase!important;line-height:1.45!important}.plan-detail-page tbody td:nth-child(1)::before{content:"Mã"}.plan-detail-page tbody td:nth-child(2)::before{content:"Nội dung"}.plan-detail-page tbody td:nth-child(3)::before{content:"Phụ trách"}.plan-detail-page tbody td:nth-child(4)::before{content:"Ưu tiên"}.plan-detail-page tbody td:nth-child(5)::before{content:"Hạn"}.plan-detail-page tbody td:nth-child(6)::before{content:"Trạng thái"}.plan-detail-page tbody td:nth-child(2) strong{font-size:15px!important;line-height:1.35!important}.plan-detail-page .subline{font-size:11px!important;line-height:1.35!important;margin-top:3px!important}.plan-detail-page .empty-state{grid-column:1/-1!important}
      }
    `}</style>
    <PageHeader eyebrow={`KẾ HOẠCH · ${recordRes.data.record_code}`} title={recordRes.data.title} description={`${TYPE_LABELS[program.program_type] || program.program_type} · Năm ${recordRes.data.work_year}`}
      actions={<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><Link className="button secondary" href="/plans">← Danh sách kế hoạch</Link><PlanWorkflowClient planId={id} currentStatus={program.workflow_status} canManage={canManage} requiredActions={requiredActions} completedActions={completedActions} composerReady={composerReady} draftActionCount={draftActions.length} /></div>} />
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}
    {program.returned_reason ? <div className="alert warning"><strong>Kế hoạch đã được trả lại chỉnh sửa · Revision {Number(program.revision_no || 1)}</strong><div style={{ marginTop: 5 }}>{program.returned_reason}</div>{program.returned_at ? <div className="tiny" style={{ marginTop: 4 }}>Trả lại lúc {formatDateTime(program.returned_at)}</div> : null}</div> : null}

    <section className="kpi-grid">
      <article className="kpi-card"><span>Trạng thái</span><div style={{ marginTop: 13 }}><StatusBadge status={program.workflow_status} /></div><small>Vòng đời kế hoạch</small></article>
      <article className="kpi-card"><span>Tiến độ</span><strong>{pct}%</strong><small>{completedActions}/{requiredActions} việc bắt buộc hoàn thành</small></article>
      <article className="kpi-card danger"><span>Việc quá hạn</span><strong>{Number(progress?.overdue_actions ?? 0)}</strong><small>Action đang trễ hạn</small></article>
      <article className="kpi-card"><span>{program.workflow_status === "DRAFT" ? "Nhiệm vụ dự kiến" : "Khoa/Phòng chủ trì"}</span><strong style={{ fontSize: 17, lineHeight: 1.25 }}>{program.workflow_status === "DRAFT" ? draftActions.length : ((departmentRes.data as any)?.short_name || (departmentRes.data as any)?.name || "—")}</strong><small>{program.workflow_status === "DRAFT" ? (composerReady ? "Đủ cấu trúc để gửi duyệt" : "Cần hoàn thiện trước khi gửi duyệt") : ((ownerRes.data as any)?.full_name || (ownerRes.data as any)?.email || "Chưa chỉ định người phụ trách")}</small></article>
    </section>

    <PlanDraftEditorClient planId={id} canManage={canManage} status={program.workflow_status} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} initial={{
      title: recordRes.data.title, programType: program.program_type, generalObjective, specificObjectives, requirements, description: program.description || "", startDate: program.start_date || "", endDate: program.end_date || "", leadDepartmentId: program.lead_department_id || "", ownerUserId: program.owner_user_id || "", draftActions, returnedReason: program.returned_reason || "", revisionNo: Number(program.revision_no || 1),
    }} />

    <section className="chart-grid">
      <article className="panel"><div className="panel-title"><div><h2>Thông tin kế hoạch</h2><p>Thông tin nền và phạm vi triển khai theo Plan Composer V2.</p></div></div><div style={{ padding: "0 19px 20px" }} className="form-stack"><div className="form-grid two">
        <div><span className="tiny muted">Loại kế hoạch</span><div style={{ marginTop: 5 }}><strong>{TYPE_LABELS[program.program_type] || program.program_type}</strong></div></div><div><span className="tiny muted">Thời gian</span><div style={{ marginTop: 5 }}><strong>{formatDate(program.start_date)} – {formatDate(program.end_date)}</strong></div></div>
        <div className="span-2"><span className="tiny muted">Mục tiêu chung</span><div style={{ marginTop: 5, lineHeight: 1.6 }}>{generalObjective || "Chưa cập nhật."}</div></div>
        <div className="span-2"><span className="tiny muted">Mục tiêu cụ thể</span>{specificObjectives.length ? <ol style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.65 }}>{specificObjectives.map((item, index) => <li key={index}>{item}</li>)}</ol> : <div style={{ marginTop: 5 }}>Chưa cập nhật.</div>}</div>
        <div className="span-2"><span className="tiny muted">Yêu cầu</span><div style={{ marginTop: 5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{requirements || "Chưa cập nhật."}</div></div>
        <div className="span-2"><span className="tiny muted">Mô tả / phạm vi</span><div style={{ marginTop: 5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{program.description || "Chưa cập nhật mô tả."}</div></div>
        {program.submitted_at ? <div><span className="tiny muted">Gửi duyệt gần nhất</span><div style={{ marginTop: 5 }}>{formatDateTime(program.submitted_at)}</div></div> : null}{program.approved_at ? <div><span className="tiny muted">Phê duyệt</span><div style={{ marginTop: 5 }}><strong>{(approverRes.data as any)?.full_name || (approverRes.data as any)?.email || "Người có thẩm quyền"}</strong> · {formatDateTime(program.approved_at)}</div></div> : null}
      </div></div></article>
      <article className="panel"><div className="panel-title"><div><h2>Tiến độ tổng hợp</h2><p>Tính tự động từ Action/Task được materialize sau phê duyệt.</p></div></div><div style={{ padding: "8px 19px 24px" }}><div className="progress-cell" style={{ minWidth: 0 }}><div className="progress-track" style={{ height: 12 }}><span style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong></div><div className="form-grid two" style={{ marginTop: 22 }}><div><span className="tiny muted">Tổng việc bắt buộc</span><div style={{ marginTop: 4, fontSize: 24, fontWeight: 800 }}>{requiredActions}</div></div><div><span className="tiny muted">Đã hoàn thành</span><div style={{ marginTop: 4, fontSize: 24, fontWeight: 800 }}>{completedActions}</div></div></div></div></article>
    </section>

    <section className="panel"><div className="panel-title"><div><h2>Nhiệm vụ / Action của kế hoạch</h2><p>Action chính thức được tạo atomic từ nhiệm vụ dự kiến khi phê duyệt; sau đó có thể bổ sung Action khi kế hoạch đang triển khai.</p></div>{canManage && program.workflow_status === "IN_PROGRESS" ? <PlanActionCreateClient planId={id} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} defaultDepartmentId={program.lead_department_id} defaultStartDate={program.start_date} defaultDueDate={program.end_date} /> : null}</div>
      {canManage && program.workflow_status === "DRAFT" ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>Các nhiệm vụ đang nằm trong <strong>Trình soạn bản Nháp</strong> phía trên và chưa giao chính thức. Khi phê duyệt, hệ thống mới tạo Action và gửi thông báo cho người được giao.</div> : null}
      {canManage && program.workflow_status === "PENDING_APPROVAL" ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>Kế hoạch đang chờ phê duyệt. Không phát sinh Action mới; nếu cần sửa, người duyệt chọn <strong>Trả lại chỉnh sửa</strong>.</div> : null}
      <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Nội dung</th><th>Phụ trách</th><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái</th></tr></thead><tbody>{linkedActions.map((x: any) => <tr key={x.action_id}><td><Link className="table-link" href={`/tasks/${x.action.record_id}`}>{x.action.record_code}</Link></td><td><strong>{x.action.title}</strong>{x.milestone_group ? <span className="subline">{x.milestone_group}</span> : null}{!x.is_required ? <span className="subline">Không tính vào tiến độ bắt buộc</span> : null}</td><td>{deptMap.get(x.action.lead_department_id) || "—"}<span className="subline">{profileMap.get(x.action.assignee_user_id) || "Chưa phân công"}</span></td><td>{x.action.priority}</td><td className={x.action.is_overdue ? "text-danger" : ""}>{formatDate(x.action.due_date)}</td><td><StatusBadge status={x.action.is_overdue ? "OVERDUE" : x.action.workflow_status} /></td></tr>)}{!linkedActions.length ? <tr><td colSpan={6}><div className="empty-state">{program.workflow_status === "DRAFT" ? "Chưa có Action chính thức; xem nhiệm vụ dự kiến trong Trình soạn bản Nháp." : "Kế hoạch chưa có nhiệm vụ/Action liên kết."}</div></td></tr> : null}</tbody></table></div>
    </section>
  </div>;
}
