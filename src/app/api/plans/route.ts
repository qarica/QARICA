import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = new Set(["ANNUAL_PLAN", "THEMATIC_PLAN", "DEPARTMENT_PLAN", "PROGRAM", "OTHER"]);
const text = (v: unknown) => String(v ?? "").trim();
const cleanList = (v: unknown) => Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 100) : [];
const cleanDraftActions = (v: unknown) => Array.isArray(v) ? v.slice(0, 300).map((x: any, i: number) => ({
  client_id: text(x?.client_id) || `draft-${i + 1}`,
  title: text(x?.title),
  description: text(x?.description) || null,
  priority: text(x?.priority || "NORMAL").toUpperCase(),
  lead_department_id: text(x?.lead_department_id) || null,
  collaborating_department_ids: Array.isArray(x?.collaborating_department_ids) ? x.collaborating_department_ids.filter((y: unknown) => typeof y === "string" && y) : [],
  assignee_user_id: text(x?.assignee_user_id) || null,
  start_date: text(x?.start_date) || null,
  due_date: text(x?.due_date) || null,
  expected_result: text(x?.expected_result),
  verification_requirement: text(x?.verification_requirement) || null,
  milestone_group: text(x?.milestone_group) || null,
  is_required: x?.is_required !== false,
  criteria_refs: Array.isArray(x?.criteria_refs) ? x.criteria_refs.slice(0, 50) : [],
})) : [];

export async function POST(request: Request) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const title = text(body.title);
  const generalObjective = text(body.general_objective || body.objective);
  const specificObjectives = cleanList(body.specific_objectives);
  const requirements = text(body.requirements);
  const workYear = Number(body.work_year);
  const programType = text(body.program_type || "ANNUAL_PLAN");
  const leadDepartmentId = text(body.lead_department_id);
  const ownerUserId = body.owner_user_id ? text(body.owner_user_id) : null;
  const startDate = body.start_date ? text(body.start_date) : null;
  const endDate = body.end_date ? text(body.end_date) : null;
  const draftActions = cleanDraftActions(body.draft_actions);

  if (!title) return NextResponse.json({ error: "Tên kế hoạch là bắt buộc." }, { status: 400 });
  if (!generalObjective) return NextResponse.json({ error: "Mục tiêu chung là bắt buộc." }, { status: 400 });
  if (!specificObjectives.length) return NextResponse.json({ error: "Cần có ít nhất 01 mục tiêu cụ thể." }, { status: 400 });
  if (!requirements) return NextResponse.json({ error: "Yêu cầu của kế hoạch là bắt buộc." }, { status: 400 });
  if (!Number.isInteger(workYear) || workYear < 2000 || workYear > 2200) return NextResponse.json({ error: "Năm kế hoạch không hợp lệ." }, { status: 400 });
  if (!ALLOWED_TYPES.has(programType)) return NextResponse.json({ error: "Loại kế hoạch không hợp lệ." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng chủ trì." }, { status: 400 });
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: "Ngày kết thúc không được trước ngày bắt đầu." }, { status: 400 });

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const { data: department, error: deptError } = await admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle();
  if (deptError || !department?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (ownerUserId) {
    const { data: owner, error: ownerError } = await admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", ownerUserId).eq("organization_id", caller.organization_id).maybeSingle();
    if (ownerError || !owner?.is_active) return NextResponse.json({ error: "Người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  }

  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_record_type: "PROGRAM", p_work_year: workYear });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã kế hoạch." }, { status: 400 });

  const { data: record, error: recordError } = await admin.from("records").insert({ organization_id: caller.organization_id, record_type: "PROGRAM", record_code: recordCode, title, work_year: workYear, owner_department_id: leadDepartmentId, owner_user_id: ownerUserId, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ kế hoạch." }, { status: 400 });

  const { data: program, error: programError } = await admin.from("work_programs").insert({
    record_id: record.id,
    program_type: programType,
    description: body.description ? text(body.description) : null,
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

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: record.id, table_name: "work_programs", row_id: program.id, action_type: "CREATE_PLAN_DRAFT", new_value: { title, specific_objective_count: specificObjectives.length, draft_action_count: draftActions.length }, request_meta: { source: "qlcl-ui", composer: "v2" } });

  return NextResponse.json({ ok: true, id: program.id, record_id: record.id, record_code: record.record_code });
}
