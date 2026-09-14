import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const commentText = String(body.comment_text || "").trim();
  if (!commentText) return NextResponse.json({ error: "Nội dung trao đổi là bắt buộc." }, { status: 400 });
  if (commentText.length > 5000) return NextResponse.json({ error: "Nội dung trao đổi tối đa 5.000 ký tự." }, { status: 400 });

  // Dùng RLS để xác nhận quyền truy cập trước khi ghi bằng service role.
  const { data: visibleRecord, error: recordError } = await supabase
    .from("records")
    .select("id,organization_id,lifecycle_status")
    .eq("id", recordId)
    .maybeSingle();
  if (recordError || !visibleRecord) return NextResponse.json({ error: recordError?.message || "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Hồ sơ không còn hoạt động nên không nhận thêm trao đổi mới." }, { status: 409 });

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", user.id).maybeSingle();
  if (callerError || !caller?.is_active || !caller.organization_id || caller.organization_id !== visibleRecord.organization_id) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc không thuộc bệnh viện của hồ sơ." }, { status: 403 });
  }

  const { data: comment, error } = await admin.from("record_comments").insert({
    record_id: recordId,
    author_user_id: user.id,
    comment_text: commentText,
    visibility_scope: "ALL_AUTHORIZED_USERS",
  }).select("id,created_at").single();
  if (error || !comment) return NextResponse.json({ error: error?.message || "Không lưu được trao đổi." }, { status: 400 });
  return NextResponse.json({ ok: true, id: comment.id, created_at: comment.created_at });
}
