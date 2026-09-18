import { createAdminClient } from "@/lib/supabase/admin";

export async function loadPlanExportData(planId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data: program, error: programError } = await admin.from("work_programs")
    .select("id,record_id,program_type,description,general_objective,specific_objectives,requirements,draft_actions,start_date,end_date,lead_department_id,lead_department_ids,owner_user_id,owner_user_ids,workflow_status")
    .eq("id", planId).maybeSingle();
  if (programError || !program) throw new Error(programError?.message || "Không tìm thấy kế hoạch.");

  const { data: record, error: recordError } = await admin.from("records")
    .select("id,record_code,title,work_year,organization_id")
    .eq("id", program.record_id).maybeSingle();
  if (recordError || !record || record.organization_id !== organizationId) throw new Error("Kế hoạch không thuộc bệnh viện hiện tại.");

  const departmentIds = Array.isArray((program as any).lead_department_ids) && (program as any).lead_department_ids.length
    ? (program as any).lead_department_ids
    : (program.lead_department_id ? [program.lead_department_id] : []);
  const ownerIds = Array.isArray((program as any).owner_user_ids) && (program as any).owner_user_ids.length
    ? (program as any).owner_user_ids
    : (program.owner_user_id ? [program.owner_user_id] : []);
  const [{ data: departments }, { data: owners }, { data: links }, { data: referenceLinks }] = await Promise.all([
    departmentIds.length ? admin.from("departments").select("id,name,short_name").in("id", departmentIds) : Promise.resolve({ data: [] }),
    ownerIds.length ? admin.from("profiles").select("user_id,full_name,email").in("user_id", ownerIds) : Promise.resolve({ data: [] }),
    admin.from("program_action_links").select("action_id,sequence_no,milestone_group").eq("program_id", planId).order("sequence_no", { ascending: true, nullsFirst: false }),
    admin.from("program_reference_links").select("directive_id,sequence_no").eq("program_id", planId).order("sequence_no", { ascending: true, nullsFirst: false }),
  ] as any);
  const departmentMap = new Map((departments ?? []).map((x: any) => [x.id, x.short_name || x.name]));
  const ownerMap = new Map((owners ?? []).map((x: any) => [x.user_id, x.full_name || x.email || x.user_id]));
  const departmentNames = departmentIds.map((id: string) => departmentMap.get(id)).filter(Boolean);
  const ownerNames = ownerIds.map((id: string) => ownerMap.get(id)).filter(Boolean);

  const directiveIds = (referenceLinks ?? []).map((x: any) => x.directive_id);
  const { data: directives } = directiveIds.length
    ? await admin.from("external_directives").select("id,record_id,source_authority,document_number,directive_type,issued_date,document_url").in("id", directiveIds)
    : { data: [] as any[] };
  const directiveRecordIds = (directives ?? []).map((x: any) => x.record_id).filter(Boolean);
  const { data: directiveRecords } = directiveRecordIds.length
    ? await admin.from("records").select("id,title").in("id", directiveRecordIds)
    : { data: [] as any[] };
  const directiveMap = new Map((directives ?? []).map((x: any) => [x.id, x]));
  const directiveRecordMap = new Map((directiveRecords ?? []).map((x: any) => [x.id, x]));
  const references = (referenceLinks ?? []).map((link: any) => {
    const d: any = directiveMap.get(link.directive_id);
    const r: any = d ? directiveRecordMap.get(d.record_id) : null;
    if (!d || !r) return null;
    return {
      id: d.id,
      number: String(d.document_number || "").trim(),
      title: String(r.title || "").trim(),
      authority: String(d.source_authority || "").trim(),
      type: String(d.directive_type || "").trim(),
      issuedDate: String(d.issued_date || "").slice(0, 10),
      url: String(d.document_url || "").trim(),
    };
  }).filter(Boolean);

  const actionIds = (links ?? []).map((x: any) => x.action_id);
  const { data: actions } = actionIds.length
    ? await admin.from("actions").select("id,record_id,title,start_date,due_date,expected_result,lead_department_id,assignee_user_id,collaborating_department_ids,collaborating_user_ids,parent_action_id").in("id", actionIds)
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
    departmentName: departmentNames[0] || "",
    ownerName: ownerNames[0] || "",
    departmentNames,
    ownerNames,
    references,
    specifics: Array.isArray(program.specific_objectives) ? program.specific_objectives.map((x: unknown) => String(x || "").trim()).filter(Boolean) : [],
    tasks: approvedTasks.length ? approvedTasks : draftTasks,
    taskMode: approvedTasks.length ? "APPROVED" : "DRAFT",
  };
}
