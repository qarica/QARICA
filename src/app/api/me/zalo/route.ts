import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tự-liên-kết Zalo cá nhân (Mức 1 của đề xuất Javis OS): CHỈ cho sửa đúng
// hàng profiles của CHÍNH người gọi (auth.uid()), không nhận user_id từ
// body — vì profiles không có policy tự-cập-nhật qua client RLS (khác
// personal_workspace_items/personal_reminders đã có policy owner rõ ràng),
// nên đi qua admin client + lọc user_id tường minh ở mọi câu lệnh, giống
// toàn bộ các route còn lại trong codebase.
async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("zalo_user_id").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ zalo_user_id: data?.zalo_user_id || null });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const zaloUserId = String(body.zalo_user_id || "").trim();
  if (!zaloUserId) return NextResponse.json({ error: "Thiếu Zalo User ID." }, { status: 400 });
  if (zaloUserId.length > 64) return NextResponse.json({ error: "Zalo User ID không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ zalo_user_id: zaloUserId }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, zalo_user_id: zaloUserId });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ zalo_user_id: null }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
