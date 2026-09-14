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

export async function POST(request: Request) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json();
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

  if (!title) return NextResponse.json({ error: "Tên công việc định kỳ là bắt buộc." }, { status: 400 });
  if (!validRule(recurrenceRule)) return NextResponse.json({ error: "Chu kỳ lặp không hợp lệ hoặc chưa được engine hỗ trợ." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NextResponse.json({ error: "Ngày bắt đầu là bắt buộc." }, { status: 400 });
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) return NextResponse.json({ error: "Ngày kết thúc không hợp lệ." }, { status: 400 });
  if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0 || dueOffsetDays > 365) return NextResponse.json({ error: "Số ngày đến hạn phải từ 0 đến 365." }, { status: 400 });
  if (!leadDepartmentId) return NextResponse.json({ error: "Cần chọn khoa/phòng chủ trì." }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ error: "Cần chọn người phụ trách." }, { status: 400 });
  if (!expectedResult) return NextResponse.json({ error: "Kết quả mong đợi là bắt buộc." }, { status: 400 });
  if (!evidenceRequirement) return NextResponse.json({ error: "Yêu cầu minh chứng là bắt buộc." }, { status: 400 });
  if (!PRIORITIES.has(priority)) return NextResponse.json({ error: "Mức ưu tiên không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id) return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const [{ data: department, error: departmentError }, { data: assignee, error: assigneeError }] = await Promise.all([
    admin.from("departments").select("id,organization_id,is_active").eq("id", leadDepartmentId).eq("organization_id", caller.organization_id).maybeSingle(),
    admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", assigneeUserId).eq("organization_id", caller.organization_id).maybeSingle(),
  ]);
  if (departmentError || !department?.is_active) return NextResponse.json({ error: "Khoa/phòng chủ trì không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });
  if (assigneeError || !assignee?.is_active) return NextResponse.json({ error: "Người phụ trách không hợp lệ hoặc đã ngưng hoạt động." }, { status: 400 });

  const { data: template, error } = await admin.from("recurring_work_templates").insert({
    organization_id: caller.organization_id,
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
    created_by: auth.user.id,
  }).select("id").single();

  if (error || !template) return NextResponse.json({ error: error?.message || "Không tạo được mẫu công việc định kỳ." }, { status: 400 });
  return NextResponse.json({ ok: true, id: template.id });
}
