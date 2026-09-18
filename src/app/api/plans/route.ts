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
  const leadDepartmentIds = cleanPlanList(body.lead_department_ids);
  const ownerUserIds = cleanPlanList(body.owner_user_ids);
  const leadDepartmentId = leadDepartmentIds[0] || planText(body.lead_department_id);
  const ownerUserId = ownerUserIds[0] || (body.owner_user_id ? planText(body.owner_user_id) : null);
  const normalizedLeadDepartmentIds = Array.from(new Set([leadDepartmentId, ...leadDepartmentIds].filter(Boolean))).slice(0, 50);
  const normalizedOwnerUserIds = Array.from(new Set([ownerUserId, ...ownerUserIds].filter(Boolean) as string[])).slice(0, 100);
  const referenceIds = cleanPlanList(body.reference_ids);
  const assignedGroupIds = cleanPlanList(body.assigned_group_ids);
  const startDate = body.start_date ? planText(body.start_date) : null;
  const endDate = body.end_date ? planText(body.end_date) : null;
  const draftActions = cleanPlanDraftActions(body.draft_actions);

  if (!title) return NextResponse.json({ error: "Tên kế hoạch là bắt buộc." }, { status: 400 });
  if (!generalObjective) return NextResponse.json({ error: "Mục tiêu chung là bắt buộc." }, { status: 400 });
  if (!Number.isInteger(workYear) || workYear < 2000 || workYear > 2200) return NextResponse.json({ error: "Năm kế hoạch không hợp lệ." }, { status: 400 });
  if (!PLAN_TYPES.has(programType)) return NextResponse.json({ error: "Loại kế hoạch không hợp lệ." }, { status: 400 });
  if (!leadDepartmentId || !normalizedLeadDepartmentIds.length) return NextResponse.json({ error: "Cần chọn ít nhất một khoa/phòng chủ trì hoặc phối hợp." }, { status: 400 });
  if (!validPlanDateWindow(startDate, endDate)) return NextResponse.json({ error: "Ngày kết thúc không được trước ngày bắt đầu." }, { status: 400 });
  for (const [index, action] of draftActions.entries()) {
    const taskError = validatePlanDraftAction(action, startDate, endDate);
    if (taskError) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: ${taskError}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const [{ data: validDepartments, error: deptError }, { data: validOwners, error: ownerError }] = await Promise.all([
    admin.from("departments").select("id").in("id", normalizedLeadDepartmentIds).eq("organization_id", caller.organization_id).eq("is_active", true),
    normalizedOwnerUserIds.length
      ? admin.from("profiles").select("user_id").in("user_id", normalizedOwnerUserIds).eq("organization_id", caller.organization_id).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (deptError || (validDepartments ?? []).length !== normalizedLeadDepartmentIds.length) return NextResponse.json({ error: "Có khoa/phòng chủ trì hoặc phối hợp không hợp lệ." }, { status: 400 });
  if (ownerError || (validOwners ?? []).length !== normalizedOwnerUserIds.length) return NextResponse.json({ error: "Có người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  if (referenceIds.length) {
    const { data: refs, error: refError } = await admin.from("external_directives").select("id,record_id").in("id", referenceIds);
    if (refError || (refs ?? []).length !== new Set(referenceIds).size) return NextResponse.json({ error: "Có căn cứ văn bản không tồn tại." }, { status: 400 });
    const refRecordIds = (refs ?? []).map((x: any) => x.record_id);
    const { data: refRecords } = await admin.from("records").select("id").in("id", refRecordIds).eq("organization_id", caller.organization_id).eq("lifecycle_status", "ACTIVE");
    if ((refRecords ?? []).length !== refRecordIds.length) return NextResponse.json({ error: "Có căn cứ văn bản nằm ngoài bệnh viện hoặc đã lưu trữ." }, { status: 400 });
  }
  if (assignedGroupIds.length) {
    const { data: groups, error: groupError } = await admin.from("work_groups").select("id").in("id", assignedGroupIds).eq("organization_id", caller.organization_id).eq("is_active", true);
    if (groupError || (groups ?? []).length !== new Set(assignedGroupIds).size) return NextResponse.json({ error: "Có nhóm công tác không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
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
    if (action.collaborating_user_ids.length) {
      const { data: collaborators } = await admin.from("profiles").select("user_id").in("user_id", action.collaborating_user_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
      if ((collaborators ?? []).length !== new Set(action.collaborating_user_ids).size) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: có người phối hợp không hợp lệ.` }, { status: 400 });
    }
    if (action.collaborating_group_ids.length) {
      const { data: groups } = await admin.from("work_groups").select("id").in("id", action.collaborating_group_ids).eq("organization_id", caller.organization_id).eq("is_active", true);
      if ((groups ?? []).length !== new Set(action.collaborating_group_ids).size) return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: có nhóm phối hợp không hợp lệ hoặc đã ngưng.` }, { status: 400 });
    }
    if (action.parent_client_id && !draftActions.some((candidate) => candidate.client_id === action.parent_client_id)) {
      return NextResponse.json({ error: `Nhiệm vụ nháp #${index + 1}: nhiệm vụ cha không còn tồn tại.` }, { status: 400 });
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
    lead_department_ids: normalizedLeadDepartmentIds,
    owner_user_id: ownerUserId,
    owner_user_ids: normalizedOwnerUserIds,
    assigned_group_ids: assignedGroupIds,
    workflow_status: "DRAFT",
  }).select("id").single();

  if (programError || !program) {
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: programError?.message || "Không tạo được nội dung kế hoạch." }, { status: 400 });
  }

  if (referenceIds.length) {
    const { error: referenceError } = await admin.from("program_reference_links").insert(
      referenceIds.map((directiveId, index) => ({
        program_id: program.id,
        directive_id: directiveId,
        relation_type: "LEGAL_BASIS",
        sequence_no: index + 1,
        created_by: auth.user.id,
      })),
    );
    if (referenceError) {
      await admin.from("work_programs").delete().eq("id", program.id);
      await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
      return NextResponse.json({ error: `Không lưu được căn cứ kế hoạch: ${referenceError.message}` }, { status: 400 });
    }
  }

  const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: record.id, table_name: "work_programs", row_id: program.id, action_type: "CREATE_PLAN_DRAFT", new_value: { title, specific_objective_count: specificObjectives.length, draft_action_count: draftActions.length, lead_department_ids: normalizedLeadDepartmentIds, owner_user_ids: normalizedOwnerUserIds, assigned_group_ids: assignedGroupIds, reference_count: referenceIds.length }, request_meta: { source: "qlcl-ui", composer: "v2" } });
  if (auditError) {
    await admin.from("work_programs").delete().eq("id", program.id);
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: `Không ghi được audit trail; bản nháp đã được hoàn tác. ${auditError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: program.id, record_id: record.id, record_code: record.record_code });
}
