import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RACI_SELECT = "id,work_plan_item_id,user_id,raci_role";
const RACI_ROLES = ["R", "A", "C", "I"];

// Thêm 1 người/vai trò RACI vào đầu việc đã có — khác với tạo đầu việc
// (nơi RACI đầy đủ bắt buộc ngay từ đầu, xem .../items/route.ts). Xoá bớt
// vai trò xem .../raci/[raciId]/route.ts (chặn xoá A/R cuối cùng).
//
// Đề xuất báo cáo kiểm thử menu: "chưa có thao tác đổi người A trực tiếp —
// phải xoá rồi gán lại (2 bước)". Thêm cờ replace_existing: true khi
// role="A" và đầu việc đã có người A khác — chuyển giao trong 1 request
// (xoá A cũ, gán A mới), có bù trừ khôi phục A cũ nếu bước gán mới thất
// bại, không để đầu việc tạm thời không có ai chữ A. Không có cờ này (hành
// vi cũ, giữ nguyên) vẫn báo lỗi yêu cầu xoá A hiện tại trước.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiPermission("work_plans.manage");
  if (!auth.ok) return auth.response;
  const { id: planId, itemId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: item } = await admin.from("work_plan_items").select("id").eq("id", itemId).eq("work_plan_id", planId).eq("organization_id", organizationId).maybeSingle();
  if (!item) return NextResponse.json({ error: "Không tìm thấy đầu việc." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || "").trim();
  const role = String(body.raci_role || "").trim().toUpperCase();
  const replaceExisting = body.replace_existing === true;
  if (!userId) return NextResponse.json({ error: "Chưa chọn người được gán." }, { status: 400 });
  if (!RACI_ROLES.includes(role)) return NextResponse.json({ error: "Vai trò RACI không hợp lệ." }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("user_id").eq("user_id", userId).eq("organization_id", organizationId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Người được gán không thuộc tổ chức của bạn." }, { status: 400 });

  if (role === "A") {
    const { data: existingA } = await admin.from("work_plan_item_raci").select("id,user_id").eq("work_plan_item_id", itemId).eq("raci_role", "A").maybeSingle();
    if (existingA) {
      if (!replaceExisting) {
        return NextResponse.json({ error: "Đầu việc đã có người chữ A — xoá vai trò A hiện tại trước khi gán người khác, hoặc chuyển giao trực tiếp." }, { status: 400 });
      }
      if (existingA.user_id === userId) {
        return NextResponse.json({ error: "Người này đã là người chữ A của đầu việc." }, { status: 400 });
      }
      const { error: deleteError } = await admin.from("work_plan_item_raci").delete().eq("id", existingA.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { data, error } = await admin
        .from("work_plan_item_raci")
        .insert({ work_plan_item_id: itemId, organization_id: organizationId, user_id: userId, raci_role: "A" })
        .select(RACI_SELECT)
        .single();
      if (error) {
        // Bù trừ: khôi phục người A cũ nếu gán người mới thất bại, tránh để
        // đầu việc tạm thời không còn ai chữ A.
        await admin.from("work_plan_item_raci").insert({ work_plan_item_id: itemId, organization_id: organizationId, user_id: existingA.user_id, raci_role: "A" });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, raci: data, replaced_user_id: existingA.user_id });
    }
  }

  const { data, error } = await admin
    .from("work_plan_item_raci")
    .insert({ work_plan_item_id: itemId, organization_id: organizationId, user_id: userId, raci_role: role })
    .select(RACI_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Người này đã có đúng vai trò này trên đầu việc." }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, raci: data });
}
