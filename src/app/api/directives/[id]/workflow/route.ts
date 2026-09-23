import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const COMPLETE_RPC = "qlcl_complete_directive_v1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "directives.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền xử lý chỉ đạo/yêu cầu." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const reason = String(body.comment || "").trim() || null;
  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "DIRECTIVE").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy yêu cầu hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("lifecycle_status,owner_department_id,owner_user_id").eq("id", recordId).single();
  const { data: directive } = await admin.from("external_directives").select("id,workflow_status,requirements").eq("record_id", recordId).single();
  if (!record || !directive) return NextResponse.json({ error: "Thiếu dữ liệu chỉ đạo/yêu cầu." }, { status: 404 });

  const oldStatus = String(directive.workflow_status || "OPEN");
  let next = oldStatus;
  let message = "Đã cập nhật yêu cầu.";
  const now = new Date().toISOString();
  const [{ data: links }, { count: evidence }] = await Promise.all([
    admin.from("directive_action_links").select("action_id").eq("directive_id", directive.id),
    admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
  ]);
  const actionIds = (links ?? []).map((x: any) => x.action_id).filter(Boolean);
  const { data: actions } = actionIds.length ? await admin.from("actions").select("workflow_status").in("id", actionIds) : { data: [] as any[] };
  const active = (actions ?? []).filter((x: any) => !["CANCELLED", "NOT_APPLICABLE"].includes(String(x.workflow_status)));
  const incomplete = active.filter((x: any) => x.workflow_status !== "COMPLETED").length;

  if (command === "ASSIGN") {
    if (oldStatus !== "OPEN" || !record.owner_department_id || !record.owner_user_id || !directive.requirements) return NextResponse.json({ error: "Cần đủ yêu cầu, đơn vị và người phụ trách trước khi phân công." }, { status: 409 });
    next = "ASSIGNED";
    message = "Đã xác nhận phân công yêu cầu.";
  } else if (command === "START") {
    if (oldStatus !== "ASSIGNED" || !active.length) return NextResponse.json({ error: "Cần ít nhất một Action thực hiện trước khi bắt đầu." }, { status: 409 });
    next = "IN_PROGRESS";
    message = "Đã bắt đầu thực hiện yêu cầu.";
  } else if (command === "SUBMIT_EVIDENCE") {
    if (oldStatus !== "IN_PROGRESS" || incomplete || !evidence) return NextResponse.json({ error: incomplete ? `Còn ${incomplete} Action chưa hoàn thành.` : "Cần minh chứng sản phẩm/đã gửi trước khi xác nhận." }, { status: 409 });
    next = "EVIDENCE_SUBMITTED";
    message = "Đã gửi kết quả và minh chứng để xác nhận.";
  } else if (command === "COMPLETE") {
    if (oldStatus !== "EVIDENCE_SUBMITTED" || !reason) return NextResponse.json({ error: "Cần kết luận xác nhận hoàn tất." }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(COMPLETE_RPC, {
      p_directive_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_reason: reason,
    });
    if (txError) {
      const txMessage = rpcErrorMessage(txError, "Không thể xác nhận hoàn tất yêu cầu.");
      return NextResponse.json({ error: txMessage }, { status: /not active|must be evidence_submitted|action|evidence|required|not found/i.test(txMessage) ? 409 : 400 });
    }
    return NextResponse.json({ ok: true, status: "COMPLETED", message: "Đã xác nhận hoàn tất yêu cầu.", transaction: "atomic", result: tx });
  } else if (command === "RETURN") {
    if (oldStatus !== "EVIDENCE_SUBMITTED" || !reason) return NextResponse.json({ error: "Cần lý do trả lại bổ sung." }, { status: 409 });
    next = "IN_PROGRESS";
    message = "Đã trả lại để bổ sung kết quả/minh chứng.";
  } else return NextResponse.json({ error: "Thao tác yêu cầu không hợp lệ." }, { status: 400 });

  const { error } = await admin.from("external_directives").update({ workflow_status: next, updated_at: now }).eq("id", directive.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_directives", row_id: directive.id, action_type: `DIRECTIVE_${command}`, old_value: { workflow_status: oldStatus }, new_value: { workflow_status: next }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: next, message, transaction: "direct" });
}
