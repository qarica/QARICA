import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TaskWorkflowClient } from "@/components/task-workflow-client";
import { hasAnyPermission, requireUserContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { canVerifyTask, taskStepResponsibility } from "@/lib/task-verification-policy";

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn",
  CRITICAL: "Rất khẩn / trọng yếu",
};

export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execution?: string }> }) {
  const { user } = await requireUserContext();
  if (!hasAnyPermission(user, ["tasks.view", "plans.manage"])) redirect("/dashboard?forbidden=1");

  const { id: recordId } = await params;
  const { execution: requestedExecutionId } = await searchParams;
  const supabase = await createClient();
  const { data: record, error: recordError } = await supabase
    .from("records")
    .select("id,record_code,title,work_year,lifecycle_status,owner_department_id,owner_user_id,created_at,updated_at")
    .eq("id", recordId)
    .eq("record_type", "ACTION")
    .maybeSingle();

  if (recordError) return <div className="alert error">Không tải được công việc: {recordError.message}</div>;
  if (!record) notFound();

  const { data: action, error: actionError } = await supabase
    .from("actions")
    .select("id,record_id,description,priority,lead_department_id,assignment_target_type,assignee_user_id,assignee_group_id,start_date,due_date,expected_result,verification_requirement,workflow_status,submitted_at,verified_at,verified_by,completion_note,created_at,updated_at")
    .eq("record_id", recordId)
    .maybeSingle();
  if (actionError) return <div className="alert error">Không tải được nội dung công việc: {actionError.message}</div>;
  if (!action) notFound();

  const [departmentRes, assigneeRes, assigneeGroupRes, groupAssignmentRes, departmentExecutionRes, departmentRoleRes, planLinkRes, evidenceRes, sourceLinksRes] = await Promise.all([
    action.lead_department_id ? supabase.from("departments").select("id,name,short_name").eq("id", action.lead_department_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    action.assignee_user_id ? supabase.from("profiles").select("user_id,full_name,email,job_title").eq("user_id", action.assignee_user_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    action.assignee_group_id ? supabase.from("work_groups").select("id,code,name,leader_user_id").eq("id", action.assignee_group_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // member_snapshot is JSONB; fetch and filter in JS to avoid PostgREST JSON encoding issues.
    action.assignee_group_id ? supabase.from("work_group_assignment_snapshots").select("member_snapshot").eq("target_record_id", recordId).eq("group_id", action.assignee_group_id).eq("assignment_role", "ACTION_ASSIGNEE_GROUP").maybeSingle() : Promise.resolve({ data: null, error: null }),
    isVerifierCandidate(user.permissions) ? supabase.from("action_department_executions").select("id,department_id,workflow_status,completed_by,completed_at").eq("action_id",action.id).eq("workflow_status","SUBMITTED").order("updated_at",{ascending:true}) : user.primaryDepartmentId ? supabase.from("action_department_executions").select("id,department_id,workflow_status,completed_by,completed_at").eq("action_id",action.id).eq("department_id",user.primaryDepartmentId).maybeSingle() : Promise.resolve({data:null,error:null}),
    user.primaryDepartmentId ? supabase.from("department_user_roles").select("role_type").eq("department_id",user.primaryDepartmentId).eq("user_id",user.id).eq("is_active",true).in("role_type",["HEAD","QUALITY_NETWORK_MEMBER"]) : Promise.resolve({data:[],error:null}),
    supabase.from("program_action_links").select("program_id,milestone_group,is_required").eq("action_id", action.id).maybeSingle(),
    supabase.from("evidence_links").select("id,evidence_id,evidence_role,action_department_execution_id").eq("record_id", recordId),
    supabase.from("record_links").select("source_record_id").eq("target_record_id", recordId).eq("relation_type", "HAS_ACTION"),
  ]);

  const verifierSubmittedExecutions = isVerifierCandidate(user.permissions) ? ((departmentExecutionRes.data ?? []) as any[]) : [];
  const selectedVerifierExecution = isVerifierCandidate(user.permissions)
    ? (verifierSubmittedExecutions.find((row: any) => row.id === requestedExecutionId) || verifierSubmittedExecutions[0] || null)
    : null;
  const departmentExecution = isVerifierCandidate(user.permissions) ? selectedVerifierExecution : departmentExecutionRes.data;

  const submittedExecutionQueue = isVerifierCandidate(user.permissions) && action.assignment_target_type === "DEPARTMENT"
    ? await supabase.from("action_department_executions").select("id,department_id,workflow_status,updated_at").eq("action_id", action.id).eq("workflow_status", "SUBMITTED").order("updated_at", { ascending: true })
    : { data: [], error: null } as any;
  const submittedDepartmentIds = Array.from(new Set((submittedExecutionQueue.data ?? []).map((row: any) => row.department_id).filter(Boolean))) as string[];
  const submittedDepartments = submittedDepartmentIds.length
    ? await supabase.from("departments").select("id,name,short_name").in("id", submittedDepartmentIds)
    : { data: [], error: null } as any;
  const submittedDepartmentMap = new Map((submittedDepartments.data ?? []).map((row: any) => [row.id, row.short_name || row.name || row.id]));

  const sourceRecordIds = Array.from(new Set((sourceLinksRes.data ?? []).map((row: any) => row.source_record_id).filter(Boolean))) as string[];
  const sourceRecordsRes = sourceRecordIds.length
    ? await supabase.from("records").select("id,record_type,record_code,title").in("id", sourceRecordIds)
    : { data: [], error: null };
  const sourceRecordTypes = Array.from(new Set((sourceRecordsRes.data ?? []).map((row: any) => String(row.record_type || "")).filter(Boolean)));
  const sourceRecords = (sourceRecordsRes.data ?? []) as Array<{ id: string; record_type: string; record_code: string; title: string }>;
  const sourceRoute = (source: { id: string; record_type: string }) => {
    if (source.record_type === "INCIDENT") return `/incidents/${source.id}`;
    if (source.record_type === "ACTION") return `/tasks/${source.id}`;
    return `/records/${source.id}`;
  };

  const visibleEvidenceLinks = action.assignment_target_type === "DEPARTMENT" && (departmentExecution as any)?.id
    ? (evidenceRes.data ?? []).filter((row: any) => row.action_department_execution_id === (departmentExecution as any).id)
    : (evidenceRes.data ?? []);
  const evidenceIds = visibleEvidenceLinks.map((row: any) => row.evidence_id).filter(Boolean) as string[];
  let evidenceItems: any[] = [];
  let evidenceItemsError: any = null;
  if (evidenceIds.length) {
    const result = await supabase
      .from("evidence")
      .select("id,title,original_file_name,mime_type,file_size,validity_status,uploaded_at")
      .in("id", evidenceIds)
      .order("uploaded_at", { ascending: false });
    evidenceItems = result.data ?? [];
    evidenceItemsError = result.error;
  }

  let sourcePlan: { id: string; title: string; code: string } | null = null;
  if (planLinkRes.data?.program_id) {
    const { data: program } = await supabase.from("work_programs").select("id,record_id").eq("id", planLinkRes.data.program_id).maybeSingle();
    if (program?.record_id) {
      const { data: planRecord } = await supabase.from("records").select("record_code,title").eq("id", program.record_id).maybeSingle();
      if (planRecord) sourcePlan = { id: program.id, title: planRecord.title, code: planRecord.record_code };
    }
  }

  const due = action.due_date ? new Date(`${action.due_date}T00:00:00`) : null;
  const isOverdue = !!due && due.getTime() < new Date().setHours(0, 0, 0, 0) && !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(action.workflow_status);
  const status = isOverdue ? "OVERDUE" : action.workflow_status;
  const canVerify = canVerifyTask(user.permissions, sourceRecordTypes, !!planLinkRes.data?.program_id);
  const isGroupAssignment = action.assignment_target_type === "GROUP" && !!action.assignee_group_id;
  const isDepartmentAssignment = action.assignment_target_type === "DEPARTMENT";
  const isAuthorizedDepartmentMember = !!departmentExecution && (departmentRoleRes.data ?? []).length > 0;
  const isCurrentUserInGroupSnapshot = Array.isArray(groupAssignmentRes.data?.member_snapshot)
    ? groupAssignmentRes.data.member_snapshot.some((member: any) => String(member?.user_id || "").trim() === user.id)
    : false;
  const canOperate = action.assignee_user_id === user.id || (isGroupAssignment && isCurrentUserInGroupSnapshot) || (isDepartmentAssignment && isAuthorizedDepartmentMember) || canVerify;
  const assigneeLabel = isGroupAssignment
    ? ([((assigneeGroupRes.data as any)?.code), ((assigneeGroupRes.data as any)?.name)].filter(Boolean).join(" · ") || "Nhóm được giao nhiệm vụ")
    : isDepartmentAssignment
      ? ((departmentRes.data as any)?.short_name || (departmentRes.data as any)?.name || "Khoa/Phòng được giao nhiệm vụ")
      : ((assigneeRes.data as any)?.full_name || (assigneeRes.data as any)?.email || "Người được giao nhiệm vụ");
  const responsibility = taskStepResponsibility(action.workflow_status, assigneeLabel, sourceRecordTypes, !!planLinkRes.data?.program_id);
  const firstError = [departmentRes as any, assigneeRes as any, assigneeGroupRes as any, groupAssignmentRes as any, departmentExecutionRes as any, departmentRoleRes as any, planLinkRes, evidenceRes, sourceLinksRes, submittedExecutionQueue as any, submittedDepartments as any, sourceRecordsRes, { error: evidenceItemsError }].find((r: any) => r?.error)?.error;

  return <div className="page-stack">
    <PageHeader
      eyebrow={`CÔNG VIỆC · ${record.record_code}`}
      title={record.title}
      description={`Năm ${record.work_year}${sourcePlan ? ` · Thuộc ${sourcePlan.code}` : ""}`}
      actions={<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {sourcePlan ? <Link className="button secondary" href={`/plans/${sourcePlan.id}`}>← Kế hoạch nguồn</Link> : <Link className="button secondary" href="/tasks">← Việc của tôi</Link>}
        <TaskWorkflowClient recordId={recordId} currentStatus={action.workflow_status} canOperate={canOperate} canVerify={canVerify} evidenceCount={evidenceItems.length} departmentExecutionId={isDepartmentAssignment ? ((departmentExecution as any)?.id || null) : null} departmentExecutionStatus={isDepartmentAssignment ? ((departmentExecution as any)?.workflow_status || null) : null} />
      </div>}
    />
    {firstError ? <div className="alert error">Một phần dữ liệu chưa tải được: {firstError.message}</div> : null}
    {isDepartmentAssignment && canVerify && (submittedExecutionQueue.data ?? []).length > 1 ? <section className="panel" style={{padding:14}}>
      <div className="tiny muted" style={{marginBottom:8}}>KHOA/PHÒNG ĐANG CHỜ XÁC MINH · {(submittedExecutionQueue.data ?? []).length}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {(submittedExecutionQueue.data ?? []).map((row:any)=><Link key={row.id} href={`/tasks/${recordId}?execution=${row.id}`} className={row.id === (departmentExecution as any)?.id ? "button primary small" : "button secondary small"}>{String(submittedDepartmentMap.get(row.department_id) || "Khoa/Phòng")}</Link>)}
      </div>
    </section> : null}

    <div className="scope-note" role="status">
      <strong>Bước hiện tại: {responsibility.step}</strong> · Chờ <strong>{responsibility.responsible}</strong> · Việc tiếp theo: <strong>{responsibility.nextAction}</strong>
    </div>

    <section className="kpi-grid">
      <article className="kpi-card"><span>Trạng thái</span><div style={{ marginTop: 13 }}><StatusBadge status={status} /></div><small>Workflow của Action</small></article>
      <article className="kpi-card"><span>Ưu tiên</span><strong style={{ fontSize: 22 }}>{PRIORITY_LABELS[action.priority] || action.priority}</strong><small>Mức độ ưu tiên xử lý</small></article>
      <article className={isOverdue ? "kpi-card danger" : "kpi-card"}><span>Hạn hoàn thành</span><strong style={{ fontSize: 22 }}>{formatDate(action.due_date)}</strong><small>{isOverdue ? "Đã quá hạn" : "Theo kế hoạch"}</small></article>
      <article className="kpi-card"><span>Minh chứng</span><strong>{evidenceItems.length}</strong><small>Đã liên kết với công việc</small></article>
    </section>

    <section className="chart-grid">
      <article className="panel">
        <div className="panel-title"><div><h2>Thông tin thực hiện</h2><p>Đơn vị, người chịu trách nhiệm và mốc thời gian.</p></div></div>
        <div style={{ padding: "0 19px 20px" }} className="form-grid two">
          <div><span className="tiny muted">Khoa/Phòng phụ trách</span><div style={{ marginTop: 5 }}><strong>{(departmentRes.data as any)?.name || "—"}</strong></div></div>
          <div><span className="tiny muted">Phân công cho</span><div style={{ marginTop: 5 }}><strong>{isGroupAssignment ? `Nhóm · ${assigneeLabel}` : isDepartmentAssignment ? `Khoa/Phòng · ${assigneeLabel}` : `Cá nhân · ${assigneeLabel}`}</strong></div></div>
          <div><span className="tiny muted">Ngày bắt đầu</span><div style={{ marginTop: 5 }}><strong>{formatDate(action.start_date)}</strong></div></div>
          <div><span className="tiny muted">Hạn hoàn thành</span><div style={{ marginTop: 5 }}><strong>{formatDate(action.due_date)}</strong></div></div>
          {sourcePlan ? <div className="span-2"><span className="tiny muted">Kế hoạch nguồn</span><div style={{ marginTop: 5 }}><Link className="table-link" href={`/plans/${sourcePlan.id}`}>{sourcePlan.code} · {sourcePlan.title}</Link></div></div> : null}
          {planLinkRes.data?.milestone_group ? <div className="span-2"><span className="tiny muted">Nhóm / mốc công việc</span><div style={{ marginTop: 5 }}>{planLinkRes.data.milestone_group}</div></div> : null}
        </div>
      </article>

      <article className="panel">
        <div className="panel-title"><div><h2>Điều kiện hoàn thành</h2><p>Kết quả mong đợi và yêu cầu xác minh.</p></div></div>
        <div style={{ padding: "0 19px 20px" }} className="form-stack">
          <div><span className="tiny muted">Kết quả mong đợi</span><div style={{ marginTop: 5, lineHeight: 1.6 }}>{action.expected_result || "Chưa cập nhật."}</div></div>
          <div><span className="tiny muted">Yêu cầu xác minh / minh chứng</span><div style={{ marginTop: 5, lineHeight: 1.6 }}>{action.verification_requirement || "Chưa quy định riêng."}</div></div>
        </div>
      </article>
    </section>

    <section className="panel">
      <div className="panel-title"><div><h2>Mô tả / hướng dẫn</h2><p>Nội dung bổ sung cho người thực hiện.</p></div></div>
      <div style={{ padding: "0 19px 22px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{action.description || "Không có mô tả bổ sung."}</div>
    </section>

    <section className="panel">
      <div className="panel-title">
        <div><h2>Minh chứng & xác minh</h2><p>Nộp file kết quả thực hiện; khi đủ minh chứng, gửi công việc sang bước xác minh.</p></div>
        <span className="code-pill">{evidenceItems.length} minh chứng</span>
      </div>
      {evidenceItems.length ? <div className="table-wrap"><table><thead><tr><th>MINH CHỨNG</th><th>FILE</th><th>DUNG LƯỢNG</th><th>THỜI GIAN NỘP</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>
        {evidenceItems.map((item) => {
          const evidenceStatus = getEvidenceStatus(item.validity_status, action.workflow_status);
          return <tr key={item.id}>
            <td><strong>{item.title}</strong></td>
            <td>{item.original_file_name || "—"}</td>
            <td>{formatBytes(item.file_size)}</td>
            <td>{formatDateTime(item.uploaded_at)}</td>
            <td><span className={`status-badge ${evidenceStatus.tone}`}>{evidenceStatus.label}</span></td>
            <td style={{ textAlign: "right" }}><div style={{display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"}}><a className="button secondary" href={`/api/evidence/${item.id}/download`} target="_blank" rel="noreferrer">Xem</a><a className="button secondary" href={`/api/evidence/${item.id}/download?download=1`}>Tải về</a></div></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="empty-state">Chưa có minh chứng. Khi công việc đang thực hiện, chọn <strong>Nộp minh chứng</strong> ở phía trên để tải file kết quả lên hệ thống.</div>}

      {action.workflow_status === "EVIDENCE_SUBMITTED" ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>Công việc đã được gửi xác minh lúc <strong>{formatDateTime(action.submitted_at)}</strong>. Minh chứng được khóa theo bộ hồ sơ hiện tại cho đến khi người xác minh xử lý.</div> : null}
      {action.workflow_status === "VERIFYING" ? <div className="scope-note" style={{ margin: "0 18px 18px" }}>Người có quyền quản lý đang kiểm tra kết quả và minh chứng của công việc.</div> : null}
      {action.workflow_status === "RETURNED" && action.completion_note ? <div className="alert error" style={{ margin: "0 18px 18px" }}><strong>Yêu cầu bổ sung:</strong> {action.completion_note}</div> : null}
      {action.workflow_status === "COMPLETED" ? <div className="alert success" style={{ margin: "0 18px 18px" }}><strong>Đã xác minh hoàn thành</strong>{action.verified_at ? ` lúc ${formatDateTime(action.verified_at)}` : ""}.{action.completion_note ? ` Nhận xét: ${action.completion_note}` : ""}</div> : null}
    </section>
  </div>;
}

function getEvidenceStatus(validityStatus: string, actionStatus: string) {
  if (actionStatus === "COMPLETED" || validityStatus === "VALID") return { label: "Đã xác minh", tone: "success" };
  if (validityStatus === "REJECTED") return { label: "Không hợp lệ", tone: "danger" };
  if (validityStatus === "EXPIRED") return { label: "Hết hiệu lực", tone: "danger" };
  if (validityStatus === "SUPERSEDED") return { label: "Đã thay thế", tone: "muted" };
  return { label: "Chờ xác minh", tone: "warning" };
}

function formatBytes(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function isVerifierCandidate(permissions: string[]) { return permissions.some((p) => ["plans.manage","quality.manage","incidents.manage","tasks.verify"].includes(p)); }
