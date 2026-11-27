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
  const reason = String(body.reason || "").trim();
  if (!SOURCES.has(source)) return NextResponse.json({ error: "Loại việc không hợp lệ." }, { status: 400 });
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
