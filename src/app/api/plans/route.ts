import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { cleanPlanDraftActions, cleanPlanList, PLAN_TYPES, planText, validatePlanDraftAction, validPlanDateWindow } from "@/lib/plan-composer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const title = planText(body.title);
  const generalObjective = planText(body.general_objective || body.objective);
  const specificObjectives = cleanPlanList(body.specific_objectives);
  const requirements = planText(body.requirements);
  const workYear = Number(body.work_year);
  const programType = planText(body.program_type || "ANNUAL_PLAN");
  const leadDepartmentId = planText(body.lead_department_id);
  const ownerUserId = body.owner_user_id ? planText(body.owner_user_id) : null;
  const startDate = body.start_date ? planText(body.start_date) : null;
  const endDate = body.end_date ? planText(body.end_date) : null;
  const draftActions = cleanPlanDraftActions(body.draft_actions);

  if (!title) return NextResponse.json({ error: "Tên kế hoạch là bắt buộc." }, { status: 400 });
  if (!generalObjective) return NextResponse.json({ error: "Mục tiêu chung là bắt buộc." }, { status: 400 });
  if (!Number.isInteger(workYear) || workYear < 2000 || workYear > 2200) return NextResponse.json({ error: "Năm kế hoạch không hợp lệ." }, { status: 400 });
  if (!PLAN_TYPES.has(programType)) return NextResponse.json({ error: "Loại kế hoạch không hợp lệ." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng chủ trì." }, { status: 400 });
  if (!validPlanDateWindow(startDate, endDate)) return NextResponse.json({ error: "Ngày kết thúc không được trước ngày bắt đầu." }, { status: 400 });
  for (const [index, action] of draftActions.entries()) {
    const taskError = validatePlanDraftAction(action, startDate, endDate);
    if (taskError) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: ${taskError}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const { data: department, error: deptError } = await admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle();
  if (deptError || !department?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (ownerUserId) {
    const { data: owner, error: ownerError } = await admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", ownerUserId).eq("organization_id", caller.organization_id).maybeSingle();
    if (ownerError || !owner?.is_active) return NextResponse.json({ error: "Người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
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

  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_org: caller.organization_id, p_record_type: "PROGRAM", p_work_year: workYear });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã kế hoạch." }, { status: 400 });

  const { data: record, error: recordError } = await admin.from("records").insert({ organization_id: caller.organization_id, record_type: "PROGRAM", record_code: recordCode, title, work_year: workYear, owner_department_id: leadDepartmentId, owner_user_id: ownerUserId, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ kế hoạch." }, { status: 400 });

  const { data: program, error: programError } = await admin.from("work_programs").insert({
    record_id: record.id,
    program_type: programType,
    description: body.description ? planText(body.description) : null,
    objective: generalObjective,
    general_objective: generalObjective,
    specific_objectives: specificObjectives,
    requirements,
    draft_actions: draftActions,
    start_date: startDate,
    end_date: endDate,
    lead_department_id: leadDepartmentId,
    owner_user_id: ownerUserId,
    workflow_status: "DRAFT",
  }).select("id").single();

  if (programError || !program) {
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: programError?.message || "Không tạo được nội dung kế hoạch." }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: record.id, table_name: "work_programs", row_id: program.id, action_type: "CREATE_PLAN_DRAFT", new_value: { title, specific_objective_count: specificObjectives.length, draft_action_count: draftActions.length }, request_meta: { source: "qlcl-ui", composer: "v2" } });
  if (auditError) {
    await admin.from("work_programs").delete().eq("id", program.id);
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: `Không ghi được audit trail; bản nháp đã được hoàn tác. ${auditError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: program.id, record_id: record.id, record_code: record.record_code });
}
