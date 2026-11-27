import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Danh sách người có thể nhận việc: nhân sự đang hoạt động của cùng bệnh viện, có quyền xem Việc của tôi (tasks.view),
// không gồm chính người chuyển. Tìm theo tên, email hoặc khoa/phòng.
export async function GET(request: Request) {
  const auth = await requireApiContext("tasks.view");
  if (!auth.ok) return auth.response;
  const organizationId = auth.context.user.organizationId;
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 403 });
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);

  const { data, error } = await createAdminClient().rpc("qlcl_list_work_assignees_v1", {
    p_organization_id: organizationId,
    p_actor_user_id: auth.user.id,
    p_query: q || null,
    p_limit: 20,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, assignees: data ?? [] });
}
