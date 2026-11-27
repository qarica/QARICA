import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hcmToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

// Hoàn tất / mở lại việc giao từ module Công văn đến NGAY trong "Việc của tôi". Chỉ người Chủ trì hoặc Phối hợp của việc đó
// (không cần quyền quản lý công văn). Ghi thẳng vào incoming_document_tasks (một nguồn sự thật) — module công văn thấy ngay.
export async function POST(request: Request) {
  const auth = await requireApiContext("tasks.view");
  if (!auth.ok) return auth.response;
  const organizationId = auth.context.user.organizationId;
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  const completed = body.completed !== false;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Thiếu công việc." }, { status: 400 });

  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from("incoming_document_tasks")
    .select("id,organization_id,incoming_document_id,title,lead_user_id,collaborating_user_ids,completed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const mine = !!task && task.organization_id === organizationId && (task.lead_user_id === auth.user.id || (task.collaborating_user_ids ?? []).includes(auth.user.id));
  if (!task || !mine) return NextResponse.json({ error: "Không tìm thấy việc hoặc bạn không phải người chủ trì/phối hợp." }, { status: 404 });

  const next = completed ? hcmToday() : null;
  const { error: updateError } = await admin.from("incoming_document_tasks").update({ completed_at: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id, record_id: null, table_name: "incoming_document_tasks", row_id: id,
    action_type: completed ? "INCOMING_TASK_COMPLETE_FROM_MY_WORK" : "INCOMING_TASK_REOPEN_FROM_MY_WORK",
    old_value: { completed_at: task.completed_at }, new_value: { completed_at: next }, reason: null, request_meta: { source: "qlcl-ui" },
  });
  return NextResponse.json({ ok: true, completed_at: next });
}
