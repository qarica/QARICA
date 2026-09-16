import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { canEditPlanContent, cleanPlanDraftActions, cleanPlanList, PLAN_TYPES, planText, validatePlanDraftAction, validPlanDateWindow } from "@/lib/plan-composer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: program, error } = await auth.supabase.from("work_programs").select("*").eq("id", id).maybeSingle();
  if (error || !program) return NextResponse.json({ error: error?.message || "Không tìm thấy kế hoạch hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (!canEditPlanContent(program.workflow_status)) return NextResponse.json({ error: "Chỉ kế hoạch Nháp hoặc được trả lại chỉnh sửa mới được sửa nội dung." }, { status: 409 });

  const title = planText(body.title);
  const programType = planText(body.program_type || program.program_type || "ANNUAL_PLAN");
  const generalObjective = planText(body.general_objective || body.objective);
  const specificObjectives = cleanPlanList(body.specific_objectives);
  const requirements = planText(body.requirements);
  const leadDepartmentId = planText(body.lead_department_id);
  const ownerUserId = planText(body.owner_user_id) || null;
  const startDate = planText(body.start_date) || null;
  const endDate = planText(body.end_date) || null;
  const draftActions = cleanPlanDraftActions(body.draft_actions);

  if (!title || !generalObjective || !specificObjectives.length || !requirements || !leadDepartmentId) return NextResponse.json({ error: "Cần hoàn thiện tên kế hoạch, mục tiêu chung, mục tiêu cụ thể, yêu cầu và khoa/phòng chủ trì." }, { status: 400 });
  if (!PLAN_TYPES.has(programType)) return NextResponse.json({ error: "Loại kế hoạch không hợp lệ." }, { status: 400 });
  if (!validPlanDateWindow(startDate, endDate)) return NextResponse.json({ error: "Ngày kết thúc không được trước ngày bắt đầu." }, { status: 400 });
  for (const [index, action] of draftActions.entries()) {
    const taskError = validatePlanDraftAction(action, startDate, endDate);
    if (taskError) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: ${taskError}` }, { status: 400 });
  }

  const { data: caller } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  const { data: record } = await admin.from("records").select("id,organization_id,lifecycle_status,title,owner_department_id,owner_user_id,updated_at").eq("id", program.record_id).maybeSingle();
  if (!record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kế hoạch không thuộc bệnh viện hiện tại." }, { status: 403 });

  const { data: dept } = await admin.from("departments").select("id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle();
  if (!dept?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ." }, { status: 400 });
  if (ownerUserId) {
    const { data: owner } = await admin.from("profiles").select("user_id,is_active").eq("user_id", ownerUserId).eq("organization_id", caller.organization_id).maybeSingle();
    if (!owner?.is_active) return NextResponse.json({ error: "Người phụ trách kế hoạch không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  }

  for (const [index, action] of draftActions.entries()) {
    const [{ data: taskDept }, { data: taskOwner }] = await Promise.all([
      admin.from("departments").select("id").eq("id", action.lead_department_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle(),
      admin.from("profiles").select("user_id").eq("user_id", action.assignee_user_id).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle(),
    ]);
    if (!taskDept) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: khoa/phòng phụ trách không hợp lệ.` }, { status: 400 });
    if (!taskOwner) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: người phụ trách không hợp lệ.` }, { status: 400 });
    if (action.collaborating_department_ids.length) {
      const { data: collaborators } = await admin.from("departments").select("id").in("id", action.collaborating_department_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
      if ((collaborators ?? []).length !== new Set(action.collaborating_department_ids).size) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: có khoa/phòng phối hợp không hợp lệ.` }, { status: 400 });
    }
  }

  const oldProgram = { ...program };
  const oldRecord = { ...record };
  const now = new Date().toISOString();
  const programPatch = {
    program_type: programType,
    general_objective: generalObjective,
    objective: generalObjective,
    specific_objectives: specificObjectives,
    requirements,
    draft_actions: draftActions,
    description: planText(body.description) || null,
    start_date: startDate,
    end_date: endDate,
    lead_department_id: leadDepartmentId,
    owner_user_id: ownerUserId,
    updated_at: now,
  };
  const recordPatch = { title, owner_department_id: leadDepartmentId, owner_user_id: ownerUserId, updated_at: now };

  const { error: updateError } = await admin.from("work_programs").update(programPatch).eq("id", id).eq("workflow_status", "DRAFT");
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  const { error: recordUpdateError } = await admin.from("records").update(recordPatch).eq("id", program.record_id);
  if (recordUpdateError) {
    await admin.from("work_programs").update({
      program_type: oldProgram.program_type,
      general_objective: oldProgram.general_objective,
      objective: oldProgram.objective,
      specific_objectives: oldProgram.specific_objectives,
      requirements: oldProgram.requirements,
      draft_actions: oldProgram.draft_actions,
      description: oldProgram.description,
      start_date: oldProgram.start_date,
      end_date: oldProgram.end_date,
      lead_department_id: oldProgram.lead_department_id,
      owner_user_id: oldProgram.owner_user_id,
      updated_at: oldProgram.updated_at,
    }).eq("id", id);
    return NextResponse.json({ error: recordUpdateError.message }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: program.record_id,
    table_name: "work_programs",
    row_id: id,
    action_type: "UPDATE_PLAN_DRAFT",
    old_value: {
      title: oldRecord.title,
      program_type: oldProgram.program_type,
      general_objective: oldProgram.general_objective,
      specific_objectives: oldProgram.specific_objectives,
      requirements: oldProgram.requirements,
      draft_action_count: Array.isArray(oldProgram.draft_actions) ? oldProgram.draft_actions.length : 0,
      start_date: oldProgram.start_date,
      end_date: oldProgram.end_date,
      lead_department_id: oldProgram.lead_department_id,
      owner_user_id: oldProgram.owner_user_id,
    },
    new_value: {
      title,
      program_type: programType,
      general_objective: generalObjective,
      specific_objectives: specificObjectives,
      requirements,
      draft_action_count: draftActions.length,
      start_date: startDate,
      end_date: endDate,
      lead_department_id: leadDepartmentId,
      owner_user_id: ownerUserId,
      revision_no: program.revision_no,
    },
    reason: planText(body.reason) || (program.returned_reason ? "Chỉnh sửa theo yêu cầu trả lại kế hoạch." : "Cập nhật nội dung kế hoạch Nháp."),
    request_meta: { source: "qlcl-ui", composer: "v2", returned_reason: program.returned_reason || null },
  });

  if (auditError) {
    await admin.from("work_programs").update({
      program_type: oldProgram.program_type,
      general_objective: oldProgram.general_objective,
      objective: oldProgram.objective,
      specific_objectives: oldProgram.specific_objectives,
      requirements: oldProgram.requirements,
      draft_actions: oldProgram.draft_actions,
      description: oldProgram.description,
      start_date: oldProgram.start_date,
      end_date: oldProgram.end_date,
      lead_department_id: oldProgram.lead_department_id,
      owner_user_id: oldProgram.owner_user_id,
      updated_at: oldProgram.updated_at,
    }).eq("id", id);
    await admin.from("records").update({ title: oldRecord.title, owner_department_id: oldRecord.owner_department_id, owner_user_id: oldRecord.owner_user_id, updated_at: oldRecord.updated_at }).eq("id", program.record_id);
    return NextResponse.json({ error: `Không ghi được audit trail; thay đổi đã được hoàn tác. ${auditError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Đã lưu bản nháp kế hoạch và audit trail." });
}
