import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Xoá 1 vai trò RACI — chặn xoá nếu đó là người A duy nhất hoặc người R
// cuối cùng của đầu việc (giữ đúng nguyên tắc RACI đã validate lúc tạo).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string; raciId: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id: planId, itemId, raciId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: item } = await admin.from("work_plan_items").select("id").eq("id", itemId).eq("work_plan_id", planId).eq("organization_id", organizationId).maybeSingle();
  if (!item) return NextResponse.json({ error: "Không tìm thấy đầu việc." }, { status: 404 });

  const { data: target } = await admin.from("work_plan_item_raci").select("id,raci_role").eq("id", raciId).eq("work_plan_item_id", itemId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Không tìm thấy phân công RACI." }, { status: 404 });

  if (target.raci_role === "A" || target.raci_role === "R") {
    const { count } = await admin.from("work_plan_item_raci").select("id", { count: "exact", head: true }).eq("work_plan_item_id", itemId).eq("raci_role", target.raci_role);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: target.raci_role === "A" ? "Không thể xoá — mỗi đầu việc phải có đúng 1 người chữ A." : "Không thể xoá — mỗi đầu việc phải có ít nhất 1 người chữ R." }, { status: 400 });
    }
  }

  const { error, count: deletedCount } = await admin.from("work_plan_item_raci").delete({ count: "exact" }).eq("id", raciId).eq("work_plan_item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!deletedCount) return NextResponse.json({ error: "Không tìm thấy phân công RACI." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
