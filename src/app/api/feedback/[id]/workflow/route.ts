import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value ?? "").trim();

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
    if (!["TRIAGED", "COORDINATING"].includes(oldStatus)) return NextResponse.json({ error: "Chỉ sinh Finding sau khi đã phân loại phản ánh." }, { status: 409 });
    const { data: existing } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "GENERATED_FINDING").maybeSingle();
    if (existing) return NextResponse.json({ error: "Phản ánh này đã có Finding liên kết." }, { status: 409 });
    const dueDate = text(body.due_date);
    if (!dueDate || !reason) return NextResponse.json({ error: "Cần mô tả vấn đề hệ thống và hạn khắc phục." }, { status: 400 });
    const { data: code, error: codeError } = await admin.rpc("next_record_code", { p_org: record.organization_id, p_record_type: "FINDING", p_work_year: record.work_year });
    if (codeError || !code) return NextResponse.json({ error: codeError?.message || "Không cấp được mã Finding." }, { status: 400 });
    const { data: findingRecord, error: recordError } = await admin.from("records").insert({ organization_id: record.organization_id, record_type: "FINDING", record_code: code, title: `Finding từ ${record.record_code}: ${record.title}`, work_year: record.work_year, owner_department_id: record.owner_department_id || feedback.related_department_id, owner_user_id: record.owner_user_id || feedback.owner_user_id, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id").single();
    if (recordError || !findingRecord) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ Finding." }, { status: 400 });
    const { data: finding, error: findingError } = await admin.from("findings").insert({ record_id: findingRecord.id, finding_type: "FEEDBACK_SYSTEM_ISSUE", description: `${reason}\nNguồn phản ánh: ${feedback.description}`, severity: text(body.severity) || "MAJOR", lead_department_id: record.owner_department_id || feedback.related_department_id, owner_user_id: record.owner_user_id || feedback.owner_user_id, identified_at: now, due_date: dueDate, workflow_status: "OPEN" }).select("id").single();
    if (findingError || !finding) { await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", findingRecord.id); return NextResponse.json({ error: findingError?.message || "Không tạo được Finding." }, { status: 400 }); }
    await admin.from("record_links").insert({ source_record_id: recordId, target_record_id: findingRecord.id, relation_type: "GENERATED_FINDING", metadata: { finding_id: finding.id, source: "FEEDBACK" }, created_by: auth.user.id });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "feedback_records", row_id: feedback.id, action_type: "FEEDBACK_CREATE_FINDING", new_value: { finding_record_id: findingRecord.id, finding_id: finding.id }, reason, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: `Đã tạo Finding ${code}; phản ánh gốc vẫn được giữ nguyên.` });
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
