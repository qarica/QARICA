import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const [{ data: investigate }, { data: close }] = await Promise.all([supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }), supabase.rpc("has_permission", { p_permission_code: "incident.close" })]);
  if (!investigate && !close) return NextResponse.json({ error: "Bạn chưa có quyền xử lý bài học/cảnh báo." }, { status: 403 });
  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;
  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "SAFETY_ALERT").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy bài học/cảnh báo." }, { status: 404 });
  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("lifecycle_status").eq("id", recordId).single();
  const { data: alert } = await admin.from("safety_alerts").select("id,status,summary,lesson,recommendation").eq("record_id", recordId).single();
  if (!record || !alert) return NextResponse.json({ error: "Thiếu dữ liệu cảnh báo." }, { status: 404 });
  const oldStatus = String(alert.status || "DRAFT");
  let next = oldStatus;
  let message = "Đã cập nhật cảnh báo.";
  const now = new Date().toISOString();
  if (command === "SUBMIT_REVIEW") {
    if (oldStatus !== "DRAFT" || !alert.summary || !alert.lesson || !alert.recommendation) return NextResponse.json({ error: "Cần đủ tóm tắt, bài học và khuyến nghị trước khi gửi rà soát." }, { status: 409 });
    next = "REVIEWING"; message = "Đã gửi nội dung cảnh báo để rà soát.";
  } else if (command === "RETURN") {
    if (!close || oldStatus !== "REVIEWING" || !reason) return NextResponse.json({ error: "Cần quyền phê duyệt và lý do trả lại." }, { status: 409 });
    next = "DRAFT"; message = "Đã trả lại nội dung để chỉnh sửa.";
  } else if (command === "PUBLISH") {
    if (!close || oldStatus !== "REVIEWING" || !reason) return NextResponse.json({ error: "Cần quyền phê duyệt và kết luận phát hành." }, { status: 409 });
    const { count: evidence } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    if (!evidence) return NextResponse.json({ error: "Cần đính kèm nguồn/bằng chứng đã rà soát trước khi phát hành." }, { status: 409 });
    next = "PUBLISHED"; message = "Đã phát hành bài học/cảnh báo an toàn.";
  } else if (command === "ARCHIVE") {
    if (!close || oldStatus !== "PUBLISHED" || !reason) return NextResponse.json({ error: "Chỉ lưu hết hiệu lực cảnh báo đã phát hành và phải ghi lý do." }, { status: 409 });
    next = "ARCHIVED";
    await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", recordId);
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "ARCHIVED", changed_by: auth.user.id, reason });
    message = "Đã lưu cảnh báo hết hiệu lực; lịch sử phát hành được giữ nguyên.";
  } else return NextResponse.json({ error: "Thao tác cảnh báo không hợp lệ." }, { status: 400 });
  const update: Record<string, unknown> = { status: next, updated_at: now };
  if (command === "PUBLISH") update.published_at = now;
  const { error } = await admin.from("safety_alerts").update(update).eq("id", alert.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "safety_alerts", row_id: alert.id, action_type: `SAFETY_ALERT_${command}`, old_value: { status: oldStatus }, new_value: { status: next }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: next, message });
}
