import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRequestContext } from "@/lib/request-context";
import { createClient } from "@/lib/supabase/server";

async function authenticatedApiUser() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  }
  return { ok: true as const, user, supabase };
}

export async function requireApiPermission(permission: string) {
  const auth = await authenticatedApiUser();
  if (!auth.ok) return auth;
  const { data: allowed, error } = await auth.supabase.rpc("has_permission", { p_permission_code: permission });
  if (error) {
    console.error(`[requireApiPermission] permission query failed (${permission}):`, error.message);
    return { ok: false as const, response: NextResponse.json({ error: "Không kiểm tra được quyền truy cập." }, { status: 500 }) };
  }
  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 }) };
  }
  return auth;
}

export async function requireApiContext(permission?: string) {
  const auth = permission ? await requireApiPermission(permission) : await authenticatedApiUser();
  if (!auth.ok) return auth;
  try {
    const context = await loadRequestContext(auth.supabase, auth.user.id, auth.user.email ?? null);
    return { ...auth, context };
  } catch (error) {
    console.error("[requireApiContext] request context failed:", error);
    return { ok: false as const, response: NextResponse.json({ error: "Không tải được ngữ cảnh người dùng/phân quyền." }, { status: 500 }) };
  }
}

// Legacy compatibility for routes not yet moved to requireApiContext().
// Fail-closed: callers must stop when error is non-null or organizationId is null.
//
// Audit giao diện QARICA (ưu tiên #2): trước đây đòi admin client cụ thể —
// nhưng việc này chỉ tra organization_id của CHÍNH người gọi, và bảng
// `profiles` đã có policy RLS select đúng phạm vi tổ chức từ trước (không
// phải lỗ hổng). Đổi sang nhận bất kỳ SupabaseClient nào (client thường
// qua createClient() tôn trọng RLS, hoặc admin khi route vẫn cần admin cho
// phần ghi khác trong cùng request) — để các route chỉ đọc không còn bắt
// buộc tạo admin client (sẽ crash ở môi trường thiếu service-role-key)
// chỉ vì gọi đúng hàm dùng chung này.
export async function callerOrganizationId(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return { organizationId: data?.organization_id ?? null, error };
}

export async function requireApiUser() {
  return authenticatedApiUser();
}
