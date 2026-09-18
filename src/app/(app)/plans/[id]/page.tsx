import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PlanActionCreateClient } from "@/components/plan-action-create-client";
import { PlanComposerClient } from "@/components/plan-composer-client";
import { PlanPrintActions } from "@/components/plan-print-actions";
import { PlanWorkflowClient } from "@/components/plan-workflow-client";
import { StatusBadge } from "@/components/status-badge";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { routeForRecord } from "@/lib/record-route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPlanReferenceOptions } from "@/lib/plan-reference-options";
import { loadWorkGroupOptions } from "@/lib/work-group-options";

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
  const admin = createAdminClient();
  const { data: program, error: programError } = await supabase
    .from("work_programs")
    .select("id,record_id,program_type,parent_program_id,description,objective,general_objective,specific_objectives,requirements,draft_actions,returned_reason,start_date,end_date,lead_department_id,lead_department_ids,owner_user_id,owner_user_ids,assigned_group_ids,workflow_status,approved_by,approved_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (programError) return <div className="alert error">Không tải được kế hoạch: {programError.message}</div>;
  if (!program) notFound();

  const [referenceOptions, referenceLinksRes, workGroupOptions] = await Promise.all([
    user.organizationId ? loadPlanReferenceOptions(user.organizationId) : Promise.resolve([]),
    admin.from("program_reference_links").select("directive_id,sequence_no").eq("program_id", id).order("sequence_no", { ascending: true, nullsFirst: false }),
    user.organizationId ? loadWorkGroupOptions(user.organizationId) : Promise.resolve([]),
  ]);
  const initialReferenceIds = (referenceLinksRes.data ?? []).map((x: any) => x.directive_id);

  let criteriaVersion83Id: string | null = null;
  if (user.organizationId) {
    const { data: criteriaSet83 } = await supabase.from("criteria_sets").select("id").eq("code", "83TC-BYT").eq("organization_id", user.organizationId).maybeSingle();
    if (criteriaSet83?.id) {
      const { data: version83 } = await supabase.from("criteria_set_versions").select("id").eq("criteria_set_id", criteriaSet83.id).maybeSingle();
      criteriaVersion83Id = version83?.id ?? null;
    }
  }

  const draftTasks: Array<{ automation_kind?: string; automation_confirmed?: boolean; automation_outputs?: Array<{ kind?: string; monitoring_recurrence?: string }> }> = Array.isArray(program.draft_actions) ? program.draft_actions : [];
  const draftActionCount = draftTasks.length;
  const outputsOf = (task: typeof draftTasks[number]) => Array.isArray(task.automation_outputs) && task.automation_outputs.length
    ? task.automation_outputs
    : (task.automation_confirmed && task.automation_kind ? [{ kind: task.automation_kind }] : []);
  const countOutput = (kind: string) => draftTasks.reduce((sum, task) => sum + outputsOf(task).filter((output) => String(output?.kind || "").toUpperCase() === kind).length, 0);
  const draftIndicatorCount = countOutput("INDICATOR");
  const draftMonitoringCount = countOutput("MONITORING");
  const draftReportCount = countOutput("REPORT");
  const draftAssessmentCount = countOutput("ASSESSMENT");
  const draftAuditCount = countOutput("AUDIT");
  const draftImprovementCount = countOutput("IMPROVEMENT");
  const draftRecurringMonitoringCount = draftTasks.reduce((sum, task) => sum + outputsOf(task).filter((output) =>
    String(output?.kind || "").toUpperCase() === "MONITORING" && !["", "ONCE"].includes(String(output?.monitoring_recurrence || "ONCE").toUpperCase())
  ).length, 0);

  const [recordRes, progressRes, departmentRes, ownerRes, approverRes, linksRes, departmentsRes, profilesRes, criteriaRes] = await Promise.all([
    supabase.from("records").select("id,record_code,title,work_year,lifecycle_status,created_by,created_at,updated_at").eq("id", program.record_id).maybeSingle(),
    supabase.from("vw_program_progress").select("program_id,required_actions,completed_actions,progress_pct,overdue_actions").eq("program_id", id).maybeSingle(),
    program.lead_department_id ? supabase.from("departments").select("id,name,short_name").eq("id", program.lead_department_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    program.owner_user_id ? supabase.from("profiles").select("user_id,full_name,email,job_title").eq("user_id", program.owner_user_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    program.approved_by ? supabase.from("profiles").select("user_id,full_name,email").eq("user_id", program.approved_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("program_action_links").select("action_id,relation_type,weight,sequence_no,milestone_group,is_required").eq("program_id", id).order("sequence_no", { ascending: true, nullsFirst: false }),
    supabase.from("departments").select("id,name,short_name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("user_id,full_name,email,primary_department_id").eq("is_active", true).order("full_name", { ascending: true, nullsFirst: false }),
    criteriaVersion83Id
      ? supabase.from("criteria_items").select("id,code,title").eq("criteria_version_id", criteriaVersion83Id).order("sequence_no", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!recordRes.data) notFound();

  const actionIds = (linksRes.data ?? []).map((x: any) => x.action_id);
  const actionsRes = actionIds.length
    ? await supabase.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,workflow_status,priority,due_date,is_overdue,days_to_due,lead_department_id,assignee_user_id").in("action_id", actionIds)
    : { data: [], error: null };
  const actionMap = new Map((actionsRes.data ?? []).map((a: any) => [a.action_id, a]));
  const linkedActions = (linksRes.data ?? []).map((link: any) => ({ ...link, action: actionMap.get(link.action_id) as any })).filter((x: any) => x.action);
  const actionRecordIds = linkedActions.map((row: any) => row.action.record_id);
  const materializedLinksRes = actionRecordIds.length
    ? await supabase.from("record_links").select("source_record_id,target_record_id,relation_type,metadata").in("source_record_id", actionRecordIds).eq("relation_type", "MATERIALIZES")
    : { data: [], error: null };
  const outputRecordIds = (materializedLinksRes.data ?? []).map((row: any) => row.target_record_id);
  const outputRecordsRes = outputRecordIds.length
    ? await supabase.from("records").select("id,record_code,record_type,title,lifecycle_status").in("id", outputRecordIds)
    : { data: [], error: null };
  const outputRecordById = new Map((outputRecordsRes.data ?? []).map((row: any) => [row.id, row]));
  const outputsByActionRecord = new Map<string, any[]>();
  for (const link of materializedLinksRes.data ?? []) {
    const output = outputRecordById.get((link as any).target_record_id);
    if (!output) continue;
    const key = String((link as any).source_record_id);
    outputsByActionRecord.set(key, [...(outputsByActionRecord.get(key) ?? []), output]);
  }


  const workYear = Number(recordRes.data.work_year);
  const { data: indicatorAssignmentsRaw } = await supabase
    .from("indicator_assignments")
    .select("id,indicator_version_id,department_id,collector_user_id,frequency,local_target,status")
    .eq("work_year", workYear)
    .eq("status", "ACTIVE");
  const indicatorVersionIds = Array.from(new Set((indicatorAssignmentsRaw ?? []).map((row: any) => row.indicator_version_id)));
  const { data: indicatorVersionsRaw } = indicatorVersionIds.length
    ? await supabase.from("indicator_definition_versions").select("id,indicator_definition_id,version_no,unit").in("id", indicatorVersionIds)
    : { data: [] as any[] };
  const indicatorDefinitionIds = Array.from(new Set((indicatorVersionsRaw ?? []).map((row: any) => row.indicator_definition_id)));
  const { data: indicatorDefinitionsRaw } = indicatorDefinitionIds.length
    ? await supabase.from("indicator_definitions").select("id,code,name").in("id", indicatorDefinitionIds).eq("is_active", true)
    : { data: [] as any[] };

  const versionById = new Map((indicatorVersionsRaw ?? []).map((row: any) => [row.id, row]));
  const definitionById = new Map((indicatorDefinitionsRaw ?? []).map((row: any) => [row.id, row]));
  const departmentNameById = new Map((departmentsRes.data ?? []).map((row: any) => [row.id, row.short_name || row.name]));
  const indicatorAssignments = (indicatorAssignmentsRaw ?? []).map((row: any) => {
    const version = versionById.get(row.indicator_version_id) as any;
    const definition = version ? definitionById.get(version.indicator_definition_id) as any : null;
    return {
      id: row.id,
      label: `${definition?.code ? definition.code + " · " : ""}${definition?.name || "Chỉ số"} · ${departmentNameById.get(row.department_id) || "Toàn viện"} · ${row.frequency || "chưa đặt tần suất"}`,
    };
  }).filter((row: any) => !row.label.startsWith("Chỉ số ·"));

  const { data: checklistVersionsRaw } = await supabase
    .from("checklist_versions")
    .select("id,checklist_template_id,version_no,status")
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false });
  const checklistTemplateIds = Array.from(new Set((checklistVersionsRaw ?? []).map((row: any) => row.checklist_template_id)));
  const { data: checklistTemplatesRaw } = checklistTemplateIds.length
    ? await supabase.from("checklist_templates").select("id,code,name,short_name,is_active").in("id", checklistTemplateIds).eq("is_active", true)
    : { data: [] as any[] };
  const templateById = new Map((checklistTemplatesRaw ?? []).map((row: any) => [row.id, row]));
  const monitoringChecklists = (checklistVersionsRaw ?? []).map((row: any) => {
    const template = templateById.get(row.checklist_template_id) as any;
    return template ? { id: row.id, label: `${template.code ? template.code + " · " : ""}${template.short_name || template.name} · v${row.version_no}` } : null;
  }).filter(Boolean) as { id: string; label: string }[];

  const { data: publishedCriteriaVersionsRaw } = await admin
    .from("criteria_set_versions")
    .select("id,criteria_set_id,version_no,status")
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false });
  const criteriaSetIds = Array.from(new Set((publishedCriteriaVersionsRaw ?? []).map((row: any) => row.criteria_set_id).filter(Boolean)));
  const { data: publishedCriteriaSetsRaw } = criteriaSetIds.length
    ? await admin.from("criteria_sets").select("id,code,name,organization_id").in("id", criteriaSetIds)
    : { data: [] as any[] };
  const criteriaSetById = new Map((publishedCriteriaSetsRaw ?? []).filter((row: any) => !row.organization_id || row.organization_id === user.organizationId).map((row: any) => [row.id, row]));
  const assessmentCriteriaVersions = (publishedCriteriaVersionsRaw ?? []).map((row: any) => {
    const set = criteriaSetById.get(row.criteria_set_id) as any;
    return set ? { id: row.id, label: `${set.code ? set.code + " · " : ""}${set.name || "Bộ tiêu chí"} · v${row.version_no}` } : null;
  }).filter(Boolean) as { id: string; label: string }[];

  const progress = progressRes.data as any;
  const pct = Math.max(0, Math.min(100, Math.round(Number(progress?.progress_pct ?? 0))));
  const requiredActions = Number(progress?.required_actions ?? 0);
  const completedActions = Number(progress?.completed_actions ?? 0);
  const canManage = user.permissions.includes("plans.manage");
  const firstError = [recordRes, progressRes, departmentRes as any, ownerRes as any, approverRes as any, linksRes, departmentsRes, profilesRes, actionsRes as any, materializedLinksRes as any, outputRecordsRes as any].find((r: any) => r?.error)?.error;
  const deptMap = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.short_name || d.name]));
  const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || "Người dùng"]));

  return <div className="page-stack plan-detail-page">
    <style>{`
      @media(max-width:760px){
        .plan-detail-page{gap:10px!important}
        .plan-detail-page .page-header h1{font-size:23px!important;line-height:1.22!important}
        .plan-detail-page .page-header p{font-size:13px!important;line-height:1.45!important}
        .plan-detail-page .page-header .button{min-height:40px!important}
        .plan-detail-page .kpi-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}
        .plan-detail-page .kpi-card{min-height:90px!important;padding:11px!important}
        .plan-detail-page .kpi-card>span{font-size:10px!important}.plan-detail-page .kpi-card>strong{font-size:24px!important}.plan-detail-page .kpi-card>small{font-size:9.5px!important;line-height:1.25!important}
        .plan-detail-page .chart-grid{grid-template-columns:1fr!important;gap:10px!important}
        .plan-detail-page .panel{border-radius:16px!important;overflow:visible!important}
        .plan-detail-page .panel-title{padding:14px!important;gap:10px!important;align-items:flex-start!important;flex-wrap:wrap!important}.plan-detail-page .panel-title h2{font-size:18px!important}.plan-detail-page .panel-title p{font-size:12px!important;line-height:1.4!important}
        .plan-detail-page .form-grid.two{grid-template-columns:1fr!important;gap:13px!important}.plan-detail-page .span-2{grid-column:auto!important}
        .plan-detail-page .table-wrap{overflow:visible!important;padding:0 10px 10px!important}
        .plan-detail-page table,.plan-detail-page tbody{display:block!important;width:100%!important}.plan-detail-page thead{display:none!important}
        .plan-detail-page tbody tr{display:block!important;margin:0 0 10px!important;border:1px solid #dce6e7!important;border-radius:14px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 3px 12px rgba(25,51,58,.035)}
        .plan-detail-page tbody td{display:grid!important;grid-template-columns:82px minmax(0,1fr)!important;gap:9px!important;align-items:start!important;width:auto!important;padding:8px 11px!important;border:0!important;border-bottom:1px solid #eef2f3!important;white-space:normal!important;min-width:0!important;font-size:13px!important;line-height:1.38!important}
        .plan-detail-page tbody td:last-child{border-bottom:0!important}.plan-detail-page tbody td::before{font-size:9px!important;font-weight:800!important;letter-spacing:.06em!important;color:#77868b!important;text-transform:uppercase!important;line-height:1.45!important}
        .plan-detail-page tbody td:nth-child(1)::before{content:"Mã"}.plan-detail-page tbody td:nth-child(2)::before{content:"Nội dung"}.plan-detail-page tbody td:nth-child(3)::before{content:"Phụ trách"}.plan-detail-page tbody td:nth-child(4)::before{content:"Ưu tiên"}.plan-detail-page tbody td:nth-child(5)::before{content:"Hạn"}.plan-detail-page tbody td:nth-child(6)::before{content:"Tự động tạo"}.plan-detail-page tbody td:nth-child(7)::before{content:"Trạng thái"}
        .plan-detail-page tbody td:nth-child(2) strong{font-size:15px!important;line-height:1.35!important}.plan-detail-page .subline{font-size:11px!important;line-height:1.35!important;margin-top:3px!important}
        .plan-detail-page .empty-state{grid-column:1/-1!important}
      }
    `}</style>
    <PageHeader
      eyebrow={`KẾ HOẠCH · ${recordRes.data.record_code}`}
      title={recordRes.data.title}
      description={`${TYPE_LABELS[program.program_type] || program.program_type} · Năm ${recordRes.data.work_year}`}
      actions={<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Link className="button secondary" href="/plans">← Danh sách kế hoạch</Link>
        <PlanPrintActions planId={id} compact />
        <PlanWorkflowClient planId={id} currentStatus={program.workflow_status} canManage={canManage} requiredActions={requiredActions} completedActions={completedActions} draftActionCount={draftActionCount} draftIndicatorCount={draftIndicatorCount} draftMonitoringCount={draftMonitoringCount} draftRecurringMonitoringCount={draftRecurringMonitoringCount} draftReportCount={draftReportCount} draftAssessmentCount={draftAssessmentCount} draftAuditCount={draftAuditCount} draftImprovementCount={draftImprovementCount} />
      </div>}
    />
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}
    {program.returned_reason && program.workflow_status === "DRAFT" ? <div className="alert error"><strong>Kế hoạch bị trả lại chỉnh sửa:</strong> {program.returned_reason}</div> : null}
    {program.workflow_status === "DRAFT" && draftActionCount === 0 ? <div className="alert info"><strong>Kế hoạch mới có hồ sơ, chưa có nhiệm vụ thực thi.</strong> Vì chưa có nhiệm vụ nên QARICA chưa thể tạo Action, đợt giám sát/bảng kiểm hoặc đầu ra liên quan. Hãy thêm/kế thừa nhiệm vụ trong phần Soạn nội dung kế hoạch; các đầu ra chỉ được tạo thật sau khi nhiệm vụ được xác nhận và kế hoạch được phê duyệt.</div> : null}

    {canManage && program.workflow_status === "DRAFT" ? <PlanComposerClient
      planId={id}
      departments={(departmentsRes.data ?? []) as any[]}
      profiles={(profilesRes.data ?? []) as any[]}
      criteriaItems={(criteriaRes.data ?? []) as any[]}
      indicatorAssignments={indicatorAssignments}
      monitoringChecklists={monitoringChecklists}
      assessmentCriteriaVersions={assessmentCriteriaVersions}
      initialTitle={recordRes.data.title}
      initialProgramType={program.program_type}
      initialDescription={program.description}
      initialGeneralObjective={program.general_objective}
      initialSpecificObjectives={program.specific_objectives}
      initialRequirements={program.requirements}
      initialDraftActions={program.draft_actions}
      defaultDepartmentId={program.lead_department_id}
      initialDepartmentIds={Array.isArray((program as any).lead_department_ids) && (program as any).lead_department_ids.length ? (program as any).lead_department_ids : (program.lead_department_id ? [program.lead_department_id] : [])}
      initialOwnerUserId={program.owner_user_id}
      initialOwnerUserIds={Array.isArray((program as any).owner_user_ids) && (program as any).owner_user_ids.length ? (program as any).owner_user_ids : (program.owner_user_id ? [program.owner_user_id] : [])}
      referenceOptions={referenceOptions}
      initialReferenceIds={initialReferenceIds}
      workGroupOptions={workGroupOptions}
      initialAssignedGroupIds={Array.isArray((program as any).assigned_group_ids) ? (program as any).assigned_group_ids : []}
      initialStartDate={program.start_date}
      initialEndDate={program.end_date}
    /> : null}

    <section className="kpi-grid">
      <article className="kpi-card"><span>Trạng thái</span><div style={{ marginTop: 13 }}><StatusBadge status={program.workflow_status} /></div><small>Vòng đời kế hoạch</small></article>
      <article className="kpi-card"><span>Tiến độ</span><strong>{pct}%</strong><small>{completedActions}/{requiredActions} việc bắt buộc hoàn thành</small></article>
      <article className="kpi-card danger"><span>Việc quá hạn</span><strong>{Number(progress?.overdue_actions ?? 0)}</strong><small>Action đang trễ hạn</small></article>
      <article className="kpi-card"><span>Khoa/Phòng chủ trì</span><strong style={{ fontSize: 17, lineHeight: 1.25 }}>{(departmentRes.data as any)?.short_name || (departmentRes.data as any)?.name || "—"}</strong><small>{(ownerRes.data as any)?.full_name || (ownerRes.data as any)?.email || "Chưa chỉ định người phụ trách"}</small></article>
    </section>

    <section className="chart-grid">
      <article className="panel">
        <div className="panel-title"><div><h2>Thông tin kế hoạch</h2><p>Thông tin nền và phạm vi triển khai.</p></div></div>
        <div style={{ padding: "0 19px 20px" }} className="form-stack">
          <div className="form-grid two">
            <div><span className="tiny muted">Loại kế hoạch</span><div style={{ marginTop: 5 }}><strong>{TYPE_LABELS[program.program_type] || program.program_type}</strong></div></div>
            <div><span className="tiny muted">Thời gian</span><div style={{ marginTop: 5 }}><strong>{formatDate(program.start_date)} – {formatDate(program.end_date)}</strong></div></div>
            <div className="span-2"><span className="tiny muted">Mục tiêu</span><div style={{ marginTop: 5, lineHeight: 1.6 }}>{program.objective || "Chưa cập nhật mục tiêu."}</div></div>
            <div className="span-2"><span className="tiny muted">Mô tả / phạm vi</span><div style={{ marginTop: 5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{program.description || "Chưa cập nhật mô tả."}</div></div>
            {program.approved_at ? <div className="span-2"><span className="tiny muted">Phê duyệt</span><div style={{ marginTop: 5 }}><strong>{(approverRes.data as any)?.full_name || (approverRes.data as any)?.email || "Người có thẩm quyền"}</strong> · {formatDateTime(program.approved_at)}</div></div> : null}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-title"><div><h2>Tiến độ tổng hợp</h2><p>Tính tự động từ Action/Task được liên kết.</p></div></div>
        <div style={{ padding: "8px 19px 24px" }}>
          <div className="progress-cell" style={{ minWidth: 0 }}><div className="progress-track" style={{ height: 12 }}><span style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong></div>
          <div className="form-grid two" style={{ marginTop: 22 }}>
            <div><span className="tiny muted">Tổng việc bắt buộc</span><div style={{ marginTop: 4, fontSize: 24, fontWeight: 800 }}>{requiredActions}</div></div>
            <div><span className="tiny muted">Đã hoàn thành</span><div style={{ marginTop: 4, fontSize: 24, fontWeight: 800 }}>{completedActions}</div></div>
          </div>
        </div>
      </article>
    </section>

    <section className="panel">
      <div className="panel-title">
        <div><h2>Nhiệm vụ / Action của kế hoạch</h2><p>Mỗi nhiệm vụ là một Action dùng chung, có người phụ trách, hạn xử lý, minh chứng và xác minh.</p></div>
        {canManage && program.workflow_status === "IN_PROGRESS" ? <PlanActionCreateClient planId={id} departments={(departmentsRes.data ?? []) as any[]} profiles={(profilesRes.data ?? []) as any[]} defaultDepartmentId={program.lead_department_id} defaultStartDate={program.start_date} defaultDueDate={program.end_date} /> : null}
      </div>
      {canManage && program.workflow_status !== "IN_PROGRESS" && program.workflow_status !== "COMPLETED" ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>
        Chỉ được giao nhiệm vụ/Action chính thức khi kế hoạch đã được phê duyệt và chuyển sang <strong>Đang triển khai</strong>. Kế hoạch Nháp hoặc Chờ phê duyệt không phát sinh giao việc mới.
      </div> : null}
      <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Nội dung</th><th>Phụ trách</th><th>Ưu tiên</th><th>Hạn</th><th>Tự động tạo</th><th>Trạng thái</th></tr></thead><tbody>
        {linkedActions.map((x: any) => { const outputs = outputsByActionRecord.get(String(x.action.record_id)) ?? []; return <tr key={x.action_id}><td><Link className="table-link" href={`/tasks/${x.action.record_id}`}>{x.action.record_code}</Link></td><td><strong>{x.action.title}</strong>{x.milestone_group ? <span className="subline">{x.milestone_group}</span> : null}{!x.is_required ? <span className="subline">Không tính vào tiến độ bắt buộc</span> : null}</td><td>{deptMap.get(x.action.lead_department_id) || "—"}<span className="subline">{profileMap.get(x.action.assignee_user_id) || "Chưa phân công"}</span></td><td>{x.action.priority}</td><td className={x.action.is_overdue ? "text-danger" : ""}>{formatDate(x.action.due_date)}</td><td>{outputs.length ? <div style={{display:"grid",gap:4}}>{outputs.map((output:any) => { const href = routeForRecord(output.record_type, output.id); const label = output.record_type === "MONITORING" ? "Đợt giám sát" : output.record_type === "INDICATOR_MEASUREMENT" ? "Kỳ đo chỉ số" : output.record_type === "REPORT" ? "Báo cáo" : output.record_type === "ASSESSMENT" ? "Tự đánh giá" : output.record_type === "AUDIT" ? "Audit / Tracer" : output.record_type === "IMPROVEMENT_PROJECT" ? "Đề án cải tiến" : output.record_type; return <Link key={output.id} className="table-link" href={href}>{label} · {output.record_code}</Link>; })}</div> : <span className="muted">Chỉ Action</span>}</td><td><StatusBadge status={x.action.is_overdue ? "OVERDUE" : x.action.workflow_status} /></td></tr>})}
        {!linkedActions.length ? <tr><td colSpan={7}><div className="empty-state">Kế hoạch chưa có nhiệm vụ/Action liên kết.</div></td></tr> : null}
      </tbody></table></div>
    </section>
  </div>;
}
