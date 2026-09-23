import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const text = (value: unknown) => String(value ?? "").trim();
const CREATE_FINDING_RPC = "qlcl_create_feedback_finding_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "feedback.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý phản ánh." }, { status: 403 });
  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = text(body.action).toUpperCase();
  const reason = text(body.comment) || null;
  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "FEEDBACK").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy phản ánh hoặc bạn không có quyền xem." }, { status: 404 });
  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("id,organization_id,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status").eq("id", recordId).single();
  const { data: feedback } = await admin.from("feedback_records").select("id,description,workflow_status,related_department_id,owner_user_id").eq("record_id", recordId).single();
  if (!record || !feedback) return NextResponse.json({ error: "Thiếu dữ liệu phản ánh." }, { status: 404 });
  if (record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Phản ánh không còn hoạt động." }, { status: 409 });
  const oldStatus = String(feedback.workflow_status || "RECEIVED");
  let next = oldStatus;
  let message = "Đã cập nhật phản ánh.";
  const now = new Date().toISOString();

  if (command === "TRIAGE") {
    if (oldStatus !== "RECEIVED" || !reason) return NextResponse.json({ error: "Cần ghi kết quả phân loại trước khi chuyển phối hợp." }, { status: 409 });
    next = "TRIAGED"; message = "Đã phân loại phản ánh.";
  } else if (command === "START_COORDINATION") {
    if (oldStatus !== "TRIAGED") return NextResponse.json({ error: "Phản ánh chưa được phân loại." }, { status: 409 });
    if (!record.owner_department_id && !feedback.related_department_id) return NextResponse.json({ error: "Cần gán khoa/phòng phối hợp trước." }, { status: 409 });
    next = "COORDINATING"; message = "Đã chuyển phối hợp xác minh/xử lý.";
  } else if (command === "CREATE_FINDING") {
    const dueDate = text(body.due_date);
    if (!dueDate || !reason) return NextResponse.json({ error: "Cần mô tả vấn đề hệ thống và hạn khắc phục." }, { status: 400 });
    const { data: tx, error: txError } = await admin.rpc(CREATE_FINDING_RPC, {
      p_feedback_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
      p_due_date: dueDate,
      p_severity: text(body.severity) || "MAJOR",
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không tạo được Finding từ phản ánh.");
      return NextResponse.json({ error: txMessage }, { status: /đã có finding|chỉ sinh finding|không tìm thấy|bắt buộc|hạn khắc phục/i.test(txMessage) ? 409 : 400 });
    }
    const findingCode = tx && typeof tx === "object" && "finding_code" in tx ? String((tx as Record<string, unknown>).finding_code || "") : "";
    return NextResponse.json({
      ok: true,
      message: findingCode ? `Đã tạo Finding ${findingCode}; phản ánh gốc vẫn được giữ nguyên.` : "Đã tạo Finding; phản ánh gốc vẫn được giữ nguyên.",
      transaction: "atomic",
      result: tx,
    });
  } else if (command === "MARK_RESPONDED") {
    if (!["TRIAGED", "COORDINATING"].includes(oldStatus) || !reason) return NextResponse.json({ error: "Cần hoàn tất xác minh/phối hợp và ghi nội dung phản hồi đã gửi." }, { status: 409 });
    const { count: evidence } = await admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId);
    if (!evidence) return NextResponse.json({ error: "Cần có minh chứng phản hồi/xác minh trước khi ghi nhận đã phản hồi." }, { status: 409 });
    next = "RESPONDED"; message = "Đã ghi nhận phản hồi được gửi; luồng Finding vẫn tiếp tục độc lập.";
  } else if (command === "CLOSE") {
    if (oldStatus !== "RESPONDED" || !reason) return NextResponse.json({ error: "Chỉ đóng sau khi đã phản hồi và có kết luận." }, { status: 409 });
    next = "CLOSED";
    await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason });
    message = "Đã đóng luồng phản hồi; Finding/Action liên quan không bị đóng theo.";
  } else return NextResponse.json({ error: "Thao tác phản ánh không hợp lệ." }, { status: 400 });

  const update: Record<string, unknown> = { workflow_status: next, updated_at: now };
  if (command === "CLOSE") update.closed_at = now;
  const { error } = await admin.from("feedback_records").update(update).eq("id", feedback.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "feedback_records", row_id: feedback.id, action_type: `FEEDBACK_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: next }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: next, message });
}
