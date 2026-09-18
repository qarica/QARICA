import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { cleanPlanDraftActions, cleanPlanList, planText, validatePlanDraftAction } from "@/lib/plan-composer";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const ALLOWED_ACTIONS = new Set(["SUBMIT", "APPROVE", "RETURN", "START", "HOLD", "RESUME", "COMPLETE"]);
const APPROVE_PLAN_BUNDLE_RPC = "qlcl_approve_plan_bundle_v6";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;
  const actorUserId = auth.user.id;

  const { id: programId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedAction = String(body.action || "").trim().toUpperCase();
  const note = body.note ? String(body.note).trim() : "";
  if (!ALLOWED_ACTIONS.has(requestedAction)) return NextResponse.json({ error: "Thao tác vòng đời kế hoạch không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller, error: callerError }, { data: program, error: programError }] = await Promise.all([
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", actorUserId).maybeSingle(),
    admin.from("work_programs").select("id,record_id,owner_user_id,workflow_status,approved_by,approved_at,general_objective,specific_objectives,requirements,draft_actions,revision_no,start_date,end_date").eq("id", programId).maybeSingle(),
  ]);

  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  if (programError || !program) return NextResponse.json({ error: programError?.message || "Không tìm thấy kế hoạch." }, { status: 404 });
  const currentProgram = program;

  const { data: record, error: recordError } = await admin.from("records").select("id,organization_id,lifecycle_status,title,work_year").eq("id", currentProgram.record_id).maybeSingle();
  if (recordError || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kế hoạch không thuộc phạm vi bệnh viện hiện tại hoặc đã ngưng hoạt động." }, { status: 403 });
  const recordId = record.id;
  const recordTitle = record.title;

  async function updateStatus(from: string, to: string, extra: Record<string, unknown> = {}) {
    if (currentProgram.workflow_status !== from) return NextResponse.json({ error: "Trạng thái hiện tại không phù hợp với thao tác này. Vui lòng tải lại trang." }, { status: 409 });
    const { error } = await admin.from("work_programs").update({ workflow_status: to, ...extra }).eq("id", currentProgram.id).eq("workflow_status", from);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: actorUserId, record_id: recordId, table_name: "work_programs", row_id: currentProgram.id, action_type: `PLAN_${to}`, old_value: { workflow_status: from }, new_value: { workflow_status: to }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, workflow_status: to });
  }

  if (requestedAction === "SUBMIT") {
    const tasks = cleanPlanDraftActions(program.draft_actions);
    if (!planText(program.general_objective)) return NextResponse.json({ error: "Cần hoàn thiện Mục tiêu chung trước khi gửi duyệt." }, { status: 409 });
    if (!tasks.length) return NextResponse.json({ error: "Kế hoạch cần có ít nhất 01 nhiệm vụ nháp trước khi gửi duyệt." }, { status: 409 });
    for (const [index, task] of tasks.entries()) {
      const taskError = validatePlanDraftAction(task, program.start_date, program.end_date);
      if (taskError) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: ${taskError}` }, { status: 409 });
      const [{ data: taskDept }, { data: taskOwner }] = await Promise.all([
        admin.from("departments").select("id").eq("id", task.lead_department_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle(),
        admin.from("profiles").select("user_id").eq("user_id", task.assignee_user_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle(),
      ]);
      if (!taskDept) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: khoa/phòng phụ trách không còn hợp lệ.` }, { status: 409 });
      if (!taskOwner) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: người phụ trách không còn hợp lệ.` }, { status: 409 });
      if (task.collaborating_department_ids.length) {
        const { data: collaborators } = await admin.from("departments").select("id").in("id", task.collaborating_department_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
        if ((collaborators ?? []).length !== new Set(task.collaborating_department_ids).size) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: có khoa/phòng phối hợp không còn hợp lệ.` }, { status: 409 });
      }
      if (task.collaborating_user_ids.length) {
        const { data: collaborators } = await admin.from("profiles").select("user_id").in("user_id", task.collaborating_user_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
        if ((collaborators ?? []).length !== new Set(task.collaborating_user_ids).size) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: có người phối hợp không còn hợp lệ.` }, { status: 409 });
      }
      if (task.collaborating_group_ids.length) {
        const { data: groups } = await admin.from("work_groups").select("id").in("id", task.collaborating_group_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
        if ((groups ?? []).length !== new Set(task.collaborating_group_ids).size) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: có nhóm phối hợp không còn hợp lệ hoặc đã ngưng.` }, { status: 409 });
      }
      if (task.parent_client_id && !tasks.some((candidate) => candidate.client_id === task.parent_client_id)) {
        return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: nhiệm vụ cha không còn tồn tại.` }, { status: 409 });
      }

      if (task.automation_confirmed && task.automation_kind === "INDICATOR") {
        const { data: assignment } = await admin
          .from("indicator_assignments")
          .select("id,department_id,work_year,status")
          .eq("id", task.automation_ref_id)
          .maybeSingle();
        if (!assignment || assignment.status !== "ACTIVE" || Number(assignment.work_year) !== Number(record.work_year)) {
          return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: chỉ số đã chọn không còn hợp lệ cho năm kế hoạch.` }, { status: 409 });
        }
        if (assignment.department_id) {
          const { data: indicatorDept } = await admin.from("departments").select("id").eq("id", assignment.department_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle();
          if (!indicatorDept) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: chỉ số đã chọn nằm ngoài phạm vi bệnh viện.` }, { status: 409 });
        }
      }

      if (task.automation_confirmed && task.automation_kind === "MONITORING") {
        const [{ data: checklistVersion }, { data: targetDept }] = await Promise.all([
          admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", task.automation_ref_id).maybeSingle(),
          task.automation_target_department_id
            ? admin.from("departments").select("id").eq("id", task.automation_target_department_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ] as any);
        if (!checklistVersion || checklistVersion.status !== "PUBLISHED") {
          return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: bảng kiểm đã chọn chưa được phát hành hoặc không còn hợp lệ.` }, { status: 409 });
        }
        if (task.automation_target_department_id && !targetDept) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: khoa/phòng được giám sát không hợp lệ.` }, { status: 409 });
        if (!task.automation_target_department_id && !task.automation_target_area) return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: cần chọn khoa/phòng hoặc phạm vi giám sát.` }, { status: 409 });
        const { data: template } = await admin.from("checklist_templates").select("id,organization_id,is_active").eq("id", checklistVersion.checklist_template_id).maybeSingle();
        if (!template?.is_active || (template.organization_id && template.organization_id !== caller.organization_id)) {
          return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: bảng kiểm đã chọn nằm ngoài phạm vi bệnh viện.` }, { status: 409 });
        }
      }

      if (task.automation_confirmed && task.automation_kind === "ASSESSMENT") {
        const { data: criteriaVersion } = await admin
          .from("criteria_set_versions")
          .select("id,criteria_set_id,status")
          .eq("id", task.automation_ref_id)
          .maybeSingle();
        if (!criteriaVersion || criteriaVersion.status !== "PUBLISHED") {
          return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: bộ tiêu chí đã chọn chưa được phát hành hoặc không còn hợp lệ.` }, { status: 409 });
        }
        const { data: criteriaSet } = await admin
          .from("criteria_sets")
          .select("id,organization_id")
          .eq("id", criteriaVersion.criteria_set_id)
          .maybeSingle();
        if (!criteriaSet || (criteriaSet.organization_id && criteriaSet.organization_id !== caller.organization_id)) {
          return NextResponse.json({ error: `Nhiệm vụ #${index + 1}: bộ tiêu chí đã chọn nằm ngoài phạm vi bệnh viện.` }, { status: 409 });
        }
      }
    }
    return updateStatus("DRAFT", "PENDING_APPROVAL", { submitted_at: new Date().toISOString(), returned_reason: null });
  }

  if (requestedAction === "RETURN") {
    if (note.length < 5) return NextResponse.json({ error: "Vui lòng ghi rõ nội dung cần chỉnh sửa." }, { status: 400 });
    if (program.workflow_status !== "PENDING_APPROVAL") return NextResponse.json({ error: "Chỉ kế hoạch đang chờ phê duyệt mới được trả lại chỉnh sửa." }, { status: 409 });
    const nextRevision = Number(program.revision_no || 1) + 1;
    const { error } = await admin.from("work_programs").update({ workflow_status: "DRAFT", approved_by: null, approved_at: null, returned_reason: note, returned_at: new Date().toISOString(), revision_no: nextRevision }).eq("id", program.id).eq("workflow_status", "PENDING_APPROVAL");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (program.owner_user_id) await admin.from("notifications").insert({ recipient_user_id: program.owner_user_id, notification_type: "PLAN_RETURNED", priority: "HIGH", title: "Kế hoạch cần chỉnh sửa", message: `${recordTitle}: ${note}`, target_record_id: recordId, target_route: `/plans/${program.id}`, notification_event_key: `plan-returned:${program.id}:${Date.now()}` });
    await admin.from("audit_logs").insert({ actor_user_id: actorUserId, record_id: recordId, table_name: "work_programs", row_id: program.id, action_type: "RETURN_PLAN_FOR_REVISION", old_value: { workflow_status: "PENDING_APPROVAL", revision_no: program.revision_no }, new_value: { workflow_status: "DRAFT", note, revision_no: nextRevision }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, workflow_status: "DRAFT" });
  }

  if (requestedAction === "APPROVE") {
    if (program.workflow_status !== "PENDING_APPROVAL") return NextResponse.json({ error: "Chỉ kế hoạch đang chờ phê duyệt mới được phê duyệt." }, { status: 409 });
    const { data: tx, error: txError } = await admin.rpc(APPROVE_PLAN_BUNDLE_RPC, { p_program_id: programId, p_actor_user_id: actorUserId });
    if (txError) {
      if (isMissingRpcFunction(txError, APPROVE_PLAN_BUNDLE_RPC)) return NextResponse.json({ error: "Plan Automation V2 chưa được kích hoạt trên cơ sở dữ liệu. Không phê duyệt để tránh tạo Action/đầu ra không đầy đủ." }, { status: 503 });
      return NextResponse.json({ error: rpcErrorMessage(txError, "Không thể phê duyệt trọn bộ kế hoạch.") }, { status: 400 });
    }
    if (program.owner_user_id && program.owner_user_id !== actorUserId) await admin.from("notifications").insert({ recipient_user_id: program.owner_user_id, notification_type: "PLAN_APPROVED", priority: "NORMAL", title: "Kế hoạch đã được phê duyệt", message: recordTitle, target_record_id: recordId, target_route: `/plans/${program.id}`, notification_event_key: `plan-approved:${program.id}:${Date.now()}` });
    return NextResponse.json({ ok: true, workflow_status: "APPROVED", transaction: "atomic", result: tx });
  }

  if (requestedAction === "START") return updateStatus("APPROVED", "IN_PROGRESS");
  if (requestedAction === "HOLD") return updateStatus("IN_PROGRESS", "ON_HOLD");
  if (requestedAction === "RESUME") return updateStatus("ON_HOLD", "IN_PROGRESS");

  if (requestedAction === "COMPLETE") {
    if (program.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ kế hoạch đang triển khai mới được xác nhận hoàn thành." }, { status: 409 });
    const { data: progress, error: progressError } = await admin.from("vw_program_progress").select("required_actions,completed_actions,progress_pct").eq("program_id", program.id).maybeSingle();
    if (progressError) return NextResponse.json({ error: progressError.message }, { status: 400 });
    const required = Number(progress?.required_actions ?? 0), completed = Number(progress?.completed_actions ?? 0);
    if (required < 1) return NextResponse.json({ error: "Kế hoạch cần có ít nhất 01 nhiệm vụ bắt buộc trước khi hoàn thành." }, { status: 409 });
    if (completed < required) return NextResponse.json({ error: `Chưa thể hoàn thành kế hoạch: mới hoàn thành ${completed}/${required} nhiệm vụ bắt buộc.` }, { status: 409 });
    return updateStatus("IN_PROGRESS", "COMPLETED");
  }

  return NextResponse.json({ error: "Thao tác không được hỗ trợ." }, { status: 400 });
}
