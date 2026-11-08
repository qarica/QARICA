import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RACI_SELECT = "id,work_plan_item_id,user_id,raci_role";
const RACI_ROLES = ["R", "A", "C", "I"];

// Thêm 1 người/vai trò RACI vào đầu việc đã có — khác với tạo đầu việc
// (nơi RACI đầy đủ bắt buộc ngay từ đầu, xem .../items/route.ts). Ở đây chỉ
// chặn thêm người A thứ 2 (đúng 1 A/đầu việc) — xoá bớt vai trò xem
// .../raci/[raciId]/route.ts (chặn xoá A/R cuối cùng).
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
  if (!userId) return NextResponse.json({ error: "Chưa chọn người được gán." }, { status: 400 });
  if (!RACI_ROLES.includes(role)) return NextResponse.json({ error: "Vai trò RACI không hợp lệ." }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("user_id").eq("user_id", userId).eq("organization_id", organizationId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Người được gán không thuộc tổ chức của bạn." }, { status: 400 });

  if (role === "A") {
    const { count } = await admin.from("work_plan_item_raci").select("id", { count: "exact", head: true }).eq("work_plan_item_id", itemId).eq("raci_role", "A");
    if (count) return NextResponse.json({ error: "Đầu việc đã có người chữ A — xoá vai trò A hiện tại trước khi gán người khác." }, { status: 400 });
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
