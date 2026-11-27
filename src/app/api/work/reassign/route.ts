import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SOURCES = new Set(["REMINDER", "ACTION"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Chuyển việc cho người khác thực hiện. Mọi kiểm tra (chủ việc, trạng thái, người nhận, lý do), cập nhật, nhật ký
// và thông báo nằm trong một hàm DB (qlcl_reassign_work_v1) nên nguyên tử; route chỉ xác thực và chuyển tham số.
export async function POST(request: Request) {
  const auth = await requireApiContext("tasks.view");
  if (!auth.ok) return auth.response;
  const organizationId = auth.context.user.organizationId;
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const source = String(body.source || "").trim().toUpperCase();
  const sourceId = String(body.id || "").trim();
  const toUserId = String(body.to_user_id || "").trim();
  const toName = String(body.to_name || "").trim().replace(/\s+/g, " ");
  const reason = String(body.reason || "").trim();
  if (!SOURCES.has(source)) return NextResponse.json({ error: "Loại việc không hợp lệ." }, { status: 400 });
  // Người nhận CHƯA có tài khoản trong hệ thống: nhập tên tự do. Việc vẫn thuộc người giao (chưa có ai khác để sở hữu),
  // được ghi nhận "đã giao cho <tên>" kèm lý do để theo dõi, và lưu nhật ký.
  if (!toUserId && toName) {
    if (!UUID_RE.test(sourceId)) return NextResponse.json({ error: "Thiếu công việc." }, { status: 400 });
    if (toName.length < 2 || toName.length > 120) return NextResponse.json({ error: "Tên người nhận từ 2 đến 120 ký tự." }, { status: 400 });
    if (reason.length < 5) return NextResponse.json({ error: "Chuyển việc phải ghi lý do (ít nhất 5 ký tự)." }, { status: 400 });
    return handoverToExternal({ organizationId, actorId: auth.user.id, source, sourceId, toName, reason });
  }
  if (!UUID_RE.test(sourceId) || !UUID_RE.test(toUserId)) return NextResponse.json({ error: "Thiếu công việc hoặc người nhận." }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Chuyển việc phải ghi lý do (ít nhất 5 ký tự)." }, { status: 400 });

  const { data, error } = await createAdminClient().rpc("qlcl_reassign_work_v1", {
    p_organization_id: organizationId,
    p_actor_user_id: auth.user.id,
    p_source: source,
    p_source_id: sourceId,
    p_to_user_id: toUserId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}

const vnDate = () => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

async function handoverToExternal(p: { organizationId: string; actorId: string; source: string; sourceId: string; toName: string; reason: string }) {
  const admin = createAdminClient();
  let recordId: string | null = null;
  let table = "";
  if (p.source === "REMINDER") {
    table = "personal_reminders";
    const { data: row } = await admin.from("personal_reminders").select("id,note,status,owner_user_id,organization_id").eq("id", p.sourceId).maybeSingle();
    if (!row || row.owner_user_id !== p.actorId || row.organization_id !== p.organizationId) return NextResponse.json({ error: "Không tìm thấy việc hoặc bạn không phải người đang giữ việc này." }, { status: 404 });
    if (row.status !== "OPEN") return NextResponse.json({ error: "Chỉ giao được việc đang mở." }, { status: 400 });
    const stamp = `[Đã giao cho ${p.toName} (chưa có tài khoản) ngày ${vnDate()} — ${p.reason}]`;
    const { error } = await admin.from("personal_reminders").update({ note: row.note ? `${stamp}\n${row.note}` : stamp }).eq("id", p.sourceId).eq("owner_user_id", p.actorId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    table = "actions";
    const { data: row } = await admin.from("actions").select("id,record_id,assignee_user_id,assignment_target_type,workflow_status").eq("id", p.sourceId).maybeSingle();
    if (!row || row.assignee_user_id !== p.actorId || row.assignment_target_type !== "USER") return NextResponse.json({ error: "Không tìm thấy việc hoặc bạn không phải người đang được giao." }, { status: 404 });
    if (!["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(String(row.workflow_status))) return NextResponse.json({ error: "Việc ở trạng thái này không giao lại được." }, { status: 400 });
    const { data: rec } = await admin.from("records").select("id,organization_id").eq("id", row.record_id).maybeSingle();
    if (!rec || rec.organization_id !== p.organizationId) return NextResponse.json({ error: "Không tìm thấy việc." }, { status: 404 });
    recordId = row.record_id;
    // Ghi nhận bằng "Chờ phản hồi" (work_followups) — cơ chế sẵn có, hiện ở bộ lọc Chờ phản hồi.
    const payload = { organization_id: p.organizationId, owner_user_id: p.actorId, source_type: "ACTION", source_id: p.sourceId, state: "WAITING", waiting_for_type: "EXTERNAL_PARTY", waiting_for_label: p.toName, note: `Đã giao cho ${p.toName} (chưa có tài khoản) ngày ${vnDate()} — ${p.reason}`, created_by: p.actorId, updated_at: new Date().toISOString() };
    const { data: existing } = await admin.from("work_followups").select("id").eq("owner_user_id", p.actorId).eq("source_type", "ACTION").eq("source_id", p.sourceId).in("state", ["ACTIVE", "WAITING"]).maybeSingle();
    const res = existing ? await admin.from("work_followups").update(payload).eq("id", existing.id) : await admin.from("work_followups").insert(payload);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  }
  await admin.from("audit_logs").insert({
    actor_user_id: p.actorId, record_id: recordId, table_name: table, row_id: p.sourceId, action_type: "WORK_HANDOVER_EXTERNAL",
    old_value: { source: p.source, owner_user_id: p.actorId }, new_value: { source: p.source, owner_user_id: p.actorId, to_name: p.toName }, reason: p.reason, request_meta: { source: "qlcl-ui" },
  });
  return NextResponse.json({ ok: true, result: { external: true, to_name: p.toName } });
}
