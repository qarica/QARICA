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
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 80);
  const forWorkPlan = String(params.get("source") || "").toUpperCase() === "WORK_PLAN";

  const { data, error } = await createAdminClient().rpc("qlcl_list_work_assignees_v1", {
    p_organization_id: organizationId,
    p_actor_user_id: auth.user.id,
    p_query: q || null,
    p_limit: 20,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  let assignees = (data ?? []) as { user_id: string }[];
  // Chuyển đầu việc Kế hoạch công việc: chỉ gợi ý người xem được Kế hoạch công việc (khớp kiểm tra trong hàm DB).
  if (forWorkPlan) {
    const admin = createAdminClient();
    const checks = await Promise.all(assignees.map(async (a) => ((await admin.rpc("qlcl_user_has_permission_v1", { p_user: a.user_id, p_code: "work_plans.view" })).data === true)));
    assignees = assignees.filter((_, i) => checks[i]);
  }
  return NextResponse.json({ ok: true, assignees });
}
