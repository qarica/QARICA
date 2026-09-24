import { NextResponse } from "next/server";
import { booleanValue, canEditQualityRecord, CAPA_EDIT_PRIORITIES, cleanOptionalText, cleanRequiredText } from "@/lib/quality-record-edit";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SUPPORTED = new Set(["FINDING", "CAPA", "RISK"]);

async function permission(supabase: Awaited<ReturnType<typeof createClient>>, code: string) {
  const { data } = await supabase.rpc("has_permission", { p_permission_code: code });
  return data === true;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const { data: record } = await supabase.from("records").select("id,record_type,title,lifecycle_status,owner_user_id").eq("id", recordId).maybeSingle();
  if (!record || !SUPPORTED.has(String(record.record_type))) return NextResponse.json({ error: "Không tìm thấy hồ sơ hỗ trợ chỉnh sửa hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Hồ sơ không còn hoạt động nên không thể chỉnh sửa." }, { status: 409 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const recordType = String(record.record_type);
  const title = cleanRequiredText(body.title);
  if (!title) return NextResponse.json({ error: "Tên hồ sơ là bắt buộc." }, { status: 400 });

  let table = "";
  let row: any = null;
  let patch: Record<string, unknown> = {};
  let canEdit = false;

  if (recordType === "FINDING") {
    table = "findings";
    const { data } = await admin.from(table).select("id,workflow_status,owner_user_id,finding_type,severity,identified_at,due_date,description,immediate_action").eq("record_id", recordId).maybeSingle();
    row = data;
    if (!row) return NextResponse.json({ error: "Không tìm thấy dữ liệu Finding." }, { status: 404 });
    const canManage = await permission(supabase, "findings.manage");
    canEdit = canManage || row.owner_user_id === user.id || record.owner_user_id === user.id;
    if (!canEdit) return NextResponse.json({ error: "Bạn không phải người được phép chỉnh sửa Finding này." }, { status: 403 });
    if (!canEditQualityRecord(recordType, row.workflow_status)) return NextResponse.json({ error: "Finding đã qua giai đoạn được phép sửa nội dung nền." }, { status: 409 });
    const description = cleanRequiredText(body.description);
    if (!description) return NextResponse.json({ error: "Mô tả phát hiện là bắt buộc." }, { status: 400 });
    patch = {
      finding_type: cleanOptionalText(body.finding_type),
      severity: cleanOptionalText(body.severity),
      identified_at: cleanOptionalText(body.identified_at),
      due_date: cleanOptionalText(body.due_date),
      description,
      immediate_action: cleanOptionalText(body.immediate_action),
      updated_at: now,
    };
  } else if (recordType === "CAPA") {
    table = "capas";
    const { data } = await admin.from(table).select("id,workflow_status,priority,effectiveness_due_date,approval_required,problem_statement,immediate_correction").eq("record_id", recordId).maybeSingle();
    row = data;
    if (!row) return NextResponse.json({ error: "Không tìm thấy dữ liệu CAPA." }, { status: 404 });
    if (!(await permission(supabase, "capa.manage"))) return NextResponse.json({ error: "Bạn chưa có quyền quản lý CAPA." }, { status: 403 });
    if (!canEditQualityRecord(recordType, row.workflow_status)) return NextResponse.json({ error: "CAPA chỉ được sửa nội dung nền khi còn DRAFT." }, { status: 409 });
    const problem = cleanRequiredText(body.problem_statement);
    const priority = String(body.priority || "NORMAL").toUpperCase();
    if (!problem) return NextResponse.json({ error: "Vấn đề cần CAPA là bắt buộc." }, { status: 400 });
    if (!CAPA_EDIT_PRIORITIES.has(priority)) return NextResponse.json({ error: "Mức ưu tiên CAPA không hợp lệ." }, { status: 400 });
    patch = {
      priority,
      effectiveness_due_date: cleanOptionalText(body.effectiveness_due_date),
      approval_required: booleanValue(body.approval_required),
      problem_statement: problem,
      immediate_correction: cleanOptionalText(body.immediate_correction),
      updated_at: now,
    };
  } else {
    table = "risks";
    const { data } = await admin.from(table).select("id,workflow_status,risk_event,cause_summary,potential_consequence,process_name,next_review_date,review_frequency").eq("record_id", recordId).maybeSingle();
    row = data;
    if (!row) return NextResponse.json({ error: "Không tìm thấy dữ liệu Risk Register." }, { status: 404 });
    if (!(await permission(supabase, "risk.manage"))) return NextResponse.json({ error: "Bạn chưa có quyền quản lý rủi ro." }, { status: 403 });
    if (!canEditQualityRecord(recordType, row.workflow_status)) return NextResponse.json({ error: "Risk Register chỉ được sửa nội dung nền trước lần đánh giá đầu tiên." }, { status: 409 });
    const riskEvent = cleanRequiredText(body.risk_event);
    if (!riskEvent) return NextResponse.json({ error: "Sự kiện rủi ro là bắt buộc." }, { status: 400 });
    patch = {
      risk_event: riskEvent,
      cause_summary: cleanOptionalText(body.cause_summary),
      potential_consequence: cleanOptionalText(body.potential_consequence),
      process_name: cleanOptionalText(body.process_name),
      next_review_date: cleanOptionalText(body.next_review_date),
      review_frequency: cleanOptionalText(body.review_frequency),
      updated_at: now,
    };
  }

  const { data: tx, error: txError } = await admin.rpc("qlcl_update_quality_record_content_v1", {
    p_record_id: recordId,
    p_actor_user_id: user.id,
    p_record_type: recordType,
    p_title: title,
    p_patch: patch,
    p_reason: cleanOptionalText(body.reason),
  });

  if (txError) {
    const message = rpcErrorMessage(txError, "Không lưu được thay đổi hồ sơ.");
    return NextResponse.json(
      { error: message },
      { status: /ngoài phạm vi|quyền|tài khoản.*ngưng/i.test(message) ? 403 : /không còn hoạt động|giai đoạn|DRAFT|đánh giá đầu tiên|bắt buộc|không hợp lệ/i.test(message) ? 409 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Đã lưu thay đổi và ghi audit trail.",
    status: tx?.workflow_status ?? row.workflow_status,
    transaction: "atomic",
  });
}
