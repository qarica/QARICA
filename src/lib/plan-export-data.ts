import { createAdminClient } from "@/lib/supabase/admin";

export async function loadPlanExportData(planId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data: program, error: programError } = await admin.from("work_programs")
    .select("id,record_id,program_type,description,general_objective,specific_objectives,requirements,draft_actions,start_date,end_date,lead_department_id,owner_user_id,workflow_status")
    .eq("id", planId).maybeSingle();
  if (programError || !program) throw new Error(programError?.message || "Không tìm thấy kế hoạch.");

  const { data: record, error: recordError } = await admin.from("records")
    .select("id,record_code,title,work_year,organization_id")
    .eq("id", program.record_id).maybeSingle();
  if (recordError || !record || record.organization_id !== organizationId) throw new Error("Kế hoạch không thuộc bệnh viện hiện tại.");

  const [{ data: department }, { data: owner }, { data: links }] = await Promise.all([
    program.lead_department_id ? admin.from("departments").select("name,short_name").eq("id", program.lead_department_id).maybeSingle() : Promise.resolve({ data: null }),
    program.owner_user_id ? admin.from("profiles").select("full_name,email").eq("user_id", program.owner_user_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("program_action_links").select("action_id,sequence_no,milestone_group").eq("program_id", planId).order("sequence_no", { ascending: true, nullsFirst: false }),
  ] as any);

  const actionIds = (links ?? []).map((x: any) => x.action_id);
  const { data: actions } = actionIds.length
    ? await admin.from("actions").select("id,record_id,title,start_date,due_date,expected_result,lead_department_id,assignee_user_id").in("id", actionIds)
    : { data: [] as any[] };
  const actionRecordIds = (actions ?? []).map((x: any) => x.record_id).filter(Boolean);
  const { data: actionRecords } = actionRecordIds.length
    ? await admin.from("records").select("id,record_code,title").in("id", actionRecordIds)
    : { data: [] as any[] };
  const actionById = new Map((actions ?? []).map((x: any) => [x.id, x]));
  const recordById = new Map((actionRecords ?? []).map((x: any) => [x.id, x]));
  const approvedTasks = (links ?? []).map((link: any) => {
    const action: any = actionById.get(link.action_id);
    const actionRecord: any = action ? recordById.get(action.record_id) : null;
    return action && actionRecord ? {
      code: actionRecord.record_code,
      title: action.title || actionRecord.title,
      expectedResult: action.expected_result || "",
      startDate: action.start_date || "",
      dueDate: action.due_date || "",
      milestoneGroup: link.milestone_group || "",
    } : null;
  }).filter(Boolean);

  const draftTasks = Array.isArray(program.draft_actions) ? program.draft_actions.map((task: any, index: number) => ({
    code: "",
    title: String(task?.title || ""),
    expectedResult: String(task?.expected_result || ""),
    startDate: String(task?.start_date || ""),
    dueDate: String(task?.due_date || ""),
    milestoneGroup: String(task?.milestone_group || ""),
    index: index + 1,
  })) : [];

  return {
    record,
    program,
    departmentName: (department as any)?.short_name || (department as any)?.name || "",
    ownerName: (owner as any)?.full_name || (owner as any)?.email || "",
    specifics: Array.isArray(program.specific_objectives) ? program.specific_objectives.map((x: unknown) => String(x || "").trim()).filter(Boolean) : [],
    tasks: approvedTasks.length ? approvedTasks : draftTasks,
    taskMode: approvedTasks.length ? "APPROVED" : "DRAFT",
  };
}
