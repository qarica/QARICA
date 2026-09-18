import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hcmToday, syncRecurringTemplateNow } from "@/lib/recurring-sync";

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
    const currentTargetType = String(current.assignment_target_type || "USER").toUpperCase();
    const hasAssignee = currentTargetType === "GROUP" ? !!current.assignee_group_id : !!current.assignee_user_id;
    if (nextActive && (!current.start_date || !current.lead_department_id || !hasAssignee || !current.expected_result || !current.evidence_requirement || !validRule(current.recurrence_rule))) {
      return NextResponse.json({ error: "Mẫu chưa đủ đối tượng phụ trách, lịch, kết quả hoặc minh chứng để kích hoạt." }, { status: 409 });
    }
  const { error } = await admin.from("recurring_work_templates").update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", caller.organization_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const sync = nextActive ? await syncRecurringTemplateNow({
      admin,
      templateId: id,
      organizationId: caller.organization_id,
      actorUserId: auth.user.id,
      horizonDays: 90,
    }) : null;
    return NextResponse.json({
      ok: true,
      sync,
      sync_warning: sync && !sync.ok ? (sync.error || sync.errorDetails?.[0] || "Đã kích hoạt mẫu nhưng chưa đồng bộ đủ lịch.") : null,
    });
  }

  const title = String(body.title || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const recurrenceRule = String(body.recurrence_rule || "").trim();
  const startDate = String(body.start_date || "").trim();
  const endDate = body.end_date ? String(body.end_date).trim() : null;
  const dueOffsetDays = Number(body.due_offset_days ?? 0);
  const leadDepartmentId = String(body.lead_department_id || "").trim();
  const assignmentTargetType = String(body.assignment_target_type ?? current.assignment_target_type ?? (body.assignee_group_id ? "GROUP" : "USER")).trim().toUpperCase();
  const assigneeUserId = String(body.assignee_user_id || "").trim();
  const assigneeGroupId = String(body.assignee_group_id || "").trim();
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
  const automationReportRecipient = body.automation_report_recipient !== undefined ? (body.automation_report_recipient ? String(body.automation_report_recipient).trim() : null) : current.automation_report_recipient;
  const automationReportMethod = body.automation_report_method !== undefined ? (body.automation_report_method ? String(body.automation_report_method).trim() : null) : current.automation_report_method;
  const automationReportType = body.automation_report_type !== undefined ? (body.automation_report_type ? String(body.automation_report_type).trim() : null) : current.automation_report_type;

  if (!title) return NextResponse.json({ error: "Tên công việc định kỳ là bắt buộc." }, { status: 400 });
  if (!validRule(recurrenceRule)) return NextResponse.json({ error: "Chu kỳ lặp không hợp lệ hoặc chưa được engine hỗ trợ." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NextResponse.json({ error: "Ngày bắt đầu là bắt buộc." }, { status: 400 });
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) return NextResponse.json({ error: "Ngày kết thúc không hợp lệ." }, { status: 400 });
  if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0 || dueOffsetDays > 365) return NextResponse.json({ error: "Số ngày đến hạn phải từ 0 đến 365." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng chủ trì." }, { status: 400 });
  if (!["USER","GROUP"].includes(assignmentTargetType)) return NextResponse.json({ error: "Đối tượng phân công không hợp lệ." }, { status: 400 });
  if (assignmentTargetType === "USER" && !assigneeUserId) return NextResponse.json({ error: "Cần chọn cá nhân phụ trách." }, { status: 400 });
  if (assignmentTargetType === "GROUP" && !assigneeGroupId) return NextResponse.json({ error: "Cần chọn nhóm phụ trách." }, { status: 400 });
  if (!expectedResult || !evidenceRequirement) return NextResponse.json({ error: "Kết quả mong đợi và yêu cầu minh chứng là bắt buộc." }, { status: 400 });
  if (!PRIORITIES.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });
  if (!["ACTION","MONITORING","REPORT"].includes(automationKind)) return NextResponse.json({ error: "Loại tự động hóa không hợp lệ." }, { status: 400 });
  if (sourceCode && sourceCode.length > 80) return NextResponse.json({ error: "Mã nguồn tự động hóa quá dài." }, { status: 400 });
  if (automationKind === "MONITORING" && !automationRefId) return NextResponse.json({ error: "Đợt giám sát tự động cần chọn bảng kiểm." }, { status: 400 });
  if (automationKind === "MONITORING" && !automationTargetDepartmentId && !automationTargetArea) return NextResponse.json({ error: "Đợt giám sát tự động cần khoa/phòng hoặc phạm vi giám sát." }, { status: 400 });
  if (automationKind === "REPORT" && !automationReportRecipient) return NextResponse.json({ error: "Báo cáo định kỳ cần nơi nhận." }, { status: 400 });
  if (automationKind === "REPORT" && !automationReportMethod) return NextResponse.json({ error: "Báo cáo định kỳ cần phương thức gửi." }, { status: 400 });

  const { data: department, error: departmentError } = await admin.from("departments").select("id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle();
  if (departmentError || !department?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (assignmentTargetType === "USER") {
    const { data: assignee, error: assigneeError } = await admin.from("profiles").select("user_id,is_active").eq("user_id", assigneeUserId).eq("organization_id", caller.organization_id).maybeSingle();
    if (assigneeError || !assignee?.is_active) return NextResponse.json({ error: "Cá nhân phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  } else {
    const { data: group, error: groupError } = await admin.from("work_groups").select("id,is_active").eq("id", assigneeGroupId).eq("organization_id", caller.organization_id).maybeSingle();
    if (groupError || !group?.is_active) return NextResponse.json({ error: "Nhóm phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
    const { count: memberCount } = await admin.from("work_group_members").select("id", { count: "exact", head: true }).eq("group_id", assigneeGroupId).eq("is_active", true);
    if (!memberCount) return NextResponse.json({ error: "Nhóm phụ trách chưa có thành viên hoạt động." }, { status: 400 });
  }

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

  const scheduleChanged =
    recurrenceRule !== String(current.recurrence_rule || "") ||
    startDate !== String(current.start_date || "") ||
    (endDate || null) !== (current.end_date || null) ||
    automationKind !== String(current.automation_kind || "ACTION") ||
    (automationRefId || null) !== (current.automation_ref_id || null) ||
    (automationTargetDepartmentId || null) !== (current.automation_target_department_id || null) ||
    (automationTargetArea || null) !== (current.automation_target_area || null);

  if (scheduleChanged) {
    const today = hcmToday();
    const { data: futureRuns, error: futureRunsError } = await admin
      .from("recurring_work_runs")
      .select("id,planned_date,generated_action_id,generated_output_record_id,status")
      .eq("template_id", id)
      .gte("planned_date", today);
    if (futureRunsError) return NextResponse.json({ error: futureRunsError.message }, { status: 400 });

    const materializedFuture = (futureRuns || []).filter((row: any) => row.generated_action_id || row.generated_output_record_id);
    if (materializedFuture.length) {
      return NextResponse.json({
        error: `Lịch này đã sinh ${materializedFuture.length} kỳ công việc/đợt giám sát trong tương lai. Không thể đổi chu kỳ hoặc nguồn đầu ra trực tiếp vì sẽ làm lệch lịch sử. Hãy ngưng mẫu cũ và tạo cấu hình thay thế.`,
      }, { status: 409 });
    }

    const removableIds = (futureRuns || []).map((row: any) => row.id).filter(Boolean);
    if (removableIds.length) {
      const { error: deleteRunsError } = await admin.from("recurring_work_runs").delete().in("id", removableIds);
      if (deleteRunsError) return NextResponse.json({ error: deleteRunsError.message }, { status: 400 });
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
    assignment_target_type: assignmentTargetType,
    assignee_user_id: assignmentTargetType === "USER" ? assigneeUserId : null,
    assignee_group_id: assignmentTargetType === "GROUP" ? assigneeGroupId : null,
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
    automation_report_recipient: automationReportRecipient,
    automation_report_method: automationReportMethod,
    automation_report_type: automationReportType,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", caller.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const sync = isActive ? await syncRecurringTemplateNow({
    admin,
    templateId: id,
    organizationId: caller.organization_id,
    actorUserId: auth.user.id,
    horizonDays: 90,
  }) : null;

  return NextResponse.json({
    ok: true,
    sync,
    sync_warning: sync && !sync.ok ? (sync.error || sync.errorDetails?.[0] || "Đã lưu cấu hình nhưng chưa đồng bộ đủ lịch.") : null,
  });
}
