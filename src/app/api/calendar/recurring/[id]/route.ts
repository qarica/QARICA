import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
const RULE_PATTERNS = [
  /^FREQ=DAILY;INTERVAL=1$/,
  /^FREQ=WEEKLY;INTERVAL=1;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/,
  /^FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=([1-9]|[12]\d|3[01])$/,
  /^FREQ=MONTHLY;INTERVAL=1;BYDAY=(MO|TU|WE|TH|FR|SA|SU);BYSETPOS=[1-4]$/,
  /^FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=([1-9]|[12]\d|3[01])$/,
  /^FREQ=YEARLY;INTERVAL=1;BYMONTH=([1-9]|1[0-2]);BYMONTHDAY=([1-9]|[12]\d|3[01])$/,
];

function validRule(value: string) {
  return RULE_PATTERNS.some((pattern) => pattern.test(value));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const { data: current, error: currentError } = await admin.from("recurring_work_templates").select("*").eq("id", id).eq("organization_id", caller.organization_id).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: currentError?.message || "Không tìm thấy mẫu định kỳ." }, { status: 404 });

  const onlyToggle = Object.keys(body).every((key) => key === "is_active");
  if (onlyToggle) {
    const nextActive = Boolean(body.is_active);
    if (nextActive && (!current.start_date || !current.lead_department_id || !current.assignee_user_id || !current.expected_result || !current.evidence_requirement || !validRule(current.recurrence_rule))) {
      return NextResponse.json({ error: "Mẫu chưa đủ người phụ trách, lịch, kết quả hoặc minh chứng để kích hoạt." }, { status: 409 });
    }
    const { error } = await admin.from("recurring_work_templates").update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", caller.organization_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const recurrenceRule = String(body.recurrence_rule || "").trim();
  const startDate = String(body.start_date || "").trim();
  const endDate = body.end_date ? String(body.end_date).trim() : null;
  const dueOffsetDays = Number(body.due_offset_days ?? 0);
  const leadDepartmentId = String(body.lead_department_id || "").trim();
  const assigneeUserId = String(body.assignee_user_id || "").trim();
  const expectedResult = String(body.expected_result || "").trim();
  const evidenceRequirement = String(body.evidence_requirement || "").trim();
  const priority = String(body.priority || "NORMAL").trim().toUpperCase();
  const isActive = body.is_active !== false;
  const sourceCode = body.source_code !== undefined ? (body.source_code ? String(body.source_code).trim() : null) : current.source_code;
  const sourceLabel = body.source_label !== undefined ? (body.source_label ? String(body.source_label).trim() : null) : current.source_label;
  const sourceCriteria = body.source_criteria !== undefined
    ? (Array.isArray(body.source_criteria) ? body.source_criteria.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 50) : [])
    : (Array.isArray(current.source_criteria) ? current.source_criteria : []);
  const automationKind = String(body.automation_kind ?? current.automation_kind ?? "ACTION").trim().toUpperCase();
  const automationRefId = body.automation_ref_id !== undefined ? (body.automation_ref_id ? String(body.automation_ref_id).trim() : null) : current.automation_ref_id;
  const automationTargetDepartmentId = body.automation_target_department_id !== undefined ? (body.automation_target_department_id ? String(body.automation_target_department_id).trim() : null) : current.automation_target_department_id;
  const automationTargetArea = body.automation_target_area !== undefined ? (body.automation_target_area ? String(body.automation_target_area).trim() : null) : current.automation_target_area;

  if (!title) return NextResponse.json({ error: "Tên công việc định kỳ là bắt buộc." }, { status: 400 });
  if (!validRule(recurrenceRule)) return NextResponse.json({ error: "Chu kỳ lặp không hợp lệ hoặc chưa được engine hỗ trợ." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NextResponse.json({ error: "Ngày bắt đầu là bắt buộc." }, { status: 400 });
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) return NextResponse.json({ error: "Ngày kết thúc không hợp lệ." }, { status: 400 });
  if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0 || dueOffsetDays > 365) return NextResponse.json({ error: "Số ngày đến hạn phải từ 0 đến 365." }, { status: 400 });
  if (!leadDepartmentId || !assigneeUserId) return NextResponse.json({ error: "Cần chọn khoa/phòng và người phụ trách." }, { status: 400 });
  if (!expectedResult || !evidenceRequirement) return NextResponse.json({ error: "Kết quả mong đợi và yêu cầu minh chứng là bắt buộc." }, { status: 400 });
  if (!PRIORITIES.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });
  if (!["ACTION","MONITORING"].includes(automationKind)) return NextResponse.json({ error: "Loại tự động hóa không hợp lệ." }, { status: 400 });
  if (sourceCode && sourceCode.length > 80) return NextResponse.json({ error: "Mã nguồn tự động hóa quá dài." }, { status: 400 });
  if (automationKind === "MONITORING" && !automationRefId) return NextResponse.json({ error: "Đợt giám sát tự động cần chọn bảng kiểm." }, { status: 400 });
  if (automationKind === "MONITORING" && !automationTargetDepartmentId && !automationTargetArea) return NextResponse.json({ error: "Đợt giám sát tự động cần khoa/phòng hoặc phạm vi giám sát." }, { status: 400 });

  const [{ data: department, error: departmentError }, { data: assignee, error: assigneeError }] = await Promise.all([
    admin.from("departments").select("id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle(),
    admin.from("profiles").select("user_id,is_active").eq("user_id", assigneeUserId).eq("organization_id", caller.organization_id).maybeSingle(),
  ]);
  if (departmentError || !department?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (assigneeError || !assignee?.is_active) return NextResponse.json({ error: "Người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  if (automationKind === "MONITORING") {
    const [{ data: checklistVersion }, { data: targetDepartment }] = await Promise.all([
      admin.from("checklist_versions").select("id,checklist_template_id,status").eq("id", automationRefId).maybeSingle(),
      automationTargetDepartmentId
        ? admin.from("departments").select("id,is_active").eq("id", automationTargetDepartmentId).eq("organization_id", caller.organization_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ] as any);
    if (!checklistVersion || checklistVersion.status !== "PUBLISHED") return NextResponse.json({ error: "Bảng kiểm tự động không hợp lệ hoặc chưa phát hành." }, { status: 400 });
    if (automationTargetDepartmentId && !targetDepartment?.is_active) return NextResponse.json({ error: "Khoa/phòng được giám sát không hợp lệ." }, { status: 400 });
    const { data: checklistTemplate } = await admin.from("checklist_templates").select("id,organization_id,is_active").eq("id", checklistVersion.checklist_template_id).maybeSingle();
    if (!checklistTemplate?.is_active || (checklistTemplate.organization_id && checklistTemplate.organization_id !== caller.organization_id)) {
      return NextResponse.json({ error: "Bảng kiểm tự động nằm ngoài phạm vi bệnh viện." }, { status: 400 });
    }
  }

  const { error } = await admin.from("recurring_work_templates").update({
    title,
    description,
    recurrence_rule: recurrenceRule,
    start_date: startDate,
    end_date: endDate,
    due_offset_days: dueOffsetDays,
    lead_department_id: leadDepartmentId,
    assignee_user_id: assigneeUserId,
    expected_result: expectedResult,
    evidence_requirement: evidenceRequirement,
    priority,
    is_active: isActive,
    source_code: sourceCode,
    source_label: sourceLabel,
    source_criteria: sourceCriteria,
    automation_kind: automationKind,
    automation_ref_id: automationRefId,
    automation_target_department_id: automationTargetDepartmentId,
    automation_target_area: automationTargetArea,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", caller.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
