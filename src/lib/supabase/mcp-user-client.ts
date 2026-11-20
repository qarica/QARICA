import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl, getPublicSupabaseKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/mcp-oauth-crypto";

// Dựng 1 Supabase client ĐẠI DIỆN ĐÚNG người đã "Allow" ở màn hình consent
// (dùng access/refresh token thật của họ, không phải service role) — để mọi
// tool MCP gọi .from()/.rpc() đều tôn trọng RLS/has_permission y hệt lúc họ
// tự thao tác trên web QARICA, không mở đường tắt quyền nào. Đây KHÔNG dùng
// createClient() (@/lib/supabase/server) vì nơi đó đọc session từ cookie
// của request đang chạy — ở đây ta đang phục vụ 1 phiên của NGƯỜI KHÁC (chủ
// token), không phải người đang gọi route /api/mcp.
export async function userScopedClientFromMcpToken(mcpAccessToken: string) {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("mcp_oauth_tokens")
    .select("access_token,refresh_token,user_id,organization_id,supabase_access_token_enc,supabase_refresh_token_enc,expires_at,scope")
    .eq("access_token", mcpAccessToken)
    .maybeSingle();
  if (error || !row) return { ok: false as const, error: "Token không hợp lệ." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, error: "Token đã hết hạn, cần refresh." };

  const supabase = createSupabaseClient(getPublicSupabaseUrl(), getPublicSupabaseKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

  const supabaseAccessToken = decryptToken(row.supabase_access_token_enc);
  const supabaseRefreshToken = decryptToken(row.supabase_refresh_token_enc);
  const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
    access_token: supabaseAccessToken,
    refresh_token: supabaseRefreshToken,
  });
  if (setSessionError || !sessionData.session) {
    return { ok: false as const, error: "Phiên đăng nhập QARICA đã hết hạn — cần kết nối lại connector." };
  }

  // Supabase tự refresh + XOAY VÒNG refresh_token khi access_token hết hạn
  // (setSession ở trên có thể đã đổi cặp token) — ghi lại bản mới nhất,
  // nếu không lần gọi sau refresh_token cũ sẽ bị Supabase từ chối (đã dùng).
  if (sessionData.session.access_token !== supabaseAccessToken || sessionData.session.refresh_token !== supabaseRefreshToken) {
    await admin
      .from("mcp_oauth_tokens")
      .update({
        supabase_access_token_enc: encryptToken(sessionData.session.access_token),
        supabase_refresh_token_enc: encryptToken(sessionData.session.refresh_token),
        updated_at: new Date().toISOString(),
      })
      .eq("access_token", mcpAccessToken);
  }

  return { ok: true as const, supabase, userId: row.user_id as string, organizationId: row.organization_id as string, scope: row.scope as string | null };
}
