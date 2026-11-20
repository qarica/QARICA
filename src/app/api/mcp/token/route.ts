import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomOpaqueToken, verifyPkce } from "@/lib/mcp-oauth-crypto";

const MCP_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 giờ — Claude tự gọi lại grant_type=refresh_token khi hết hạn.

async function parseBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await request.json().catch(() => ({}))) as Record<string, string>;
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

// Đổi authorization code (hoặc refresh_token) lấy access_token của MCP —
// gọi từ server của Claude, không phải trình duyệt, nên KHÔNG có cookie
// QARICA nào kèm theo; danh tính người dùng hoàn toàn dựa vào bản ghi đã
// tạo sẵn ở /api/mcp/authorize/confirm (grant code) hoặc mcp_oauth_tokens
// (refresh).
export async function POST(request: Request) {
  const body = await parseBody(request);
  const grantType = body.grant_type;
  const admin = createAdminClient();

  if (grantType === "authorization_code") {
    const code = body.code || "";
    const { data: row } = await admin.from("mcp_oauth_codes").select("*").eq("code", code).maybeSingle();
    if (!row) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    // 1 lần dùng — xoá ngay bất kể bước sau đúng/sai, chống phát lại (replay).
    await admin.from("mcp_oauth_codes").delete().eq("code", code);

    if (new Date(row.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    if (row.client_id !== body.client_id || row.redirect_uri !== body.redirect_uri) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    if (!verifyPkce(body.code_verifier || "", row.code_challenge, row.code_challenge_method)) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const accessToken = randomOpaqueToken();
    const refreshToken = randomOpaqueToken();
    const expiresAt = new Date(Date.now() + MCP_ACCESS_TOKEN_TTL_MS).toISOString();
    const { error } = await admin.from("mcp_oauth_tokens").insert({
      access_token: accessToken,
      refresh_token: refreshToken,
      client_id: row.client_id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      supabase_access_token_enc: row.supabase_access_token_enc,
      supabase_refresh_token_enc: row.supabase_refresh_token_enc,
      scope: row.scope,
      expires_at: expiresAt,
    });
    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    return NextResponse.json({ access_token: accessToken, token_type: "Bearer", expires_in: MCP_ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refreshToken, scope: row.scope || undefined });
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.refresh_token || "";
    const { data: row } = await admin.from("mcp_oauth_tokens").select("*").eq("refresh_token", refreshToken).maybeSingle();
    if (!row) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    if (row.client_id !== body.client_id) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });

    // Xoay vòng: phát hành access/refresh_token MỚI, xoá bản ghi cũ — refresh
    // token chỉ dùng được 1 lần, giảm thiệt hại nếu 1 token cũ bị rò rỉ.
    const accessToken = randomOpaqueToken();
    const newRefreshToken = randomOpaqueToken();
    const expiresAt = new Date(Date.now() + MCP_ACCESS_TOKEN_TTL_MS).toISOString();
    const { error } = await admin.from("mcp_oauth_tokens").insert({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      client_id: row.client_id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      supabase_access_token_enc: row.supabase_access_token_enc,
      supabase_refresh_token_enc: row.supabase_refresh_token_enc,
      scope: row.scope,
      expires_at: expiresAt,
    });
    await admin.from("mcp_oauth_tokens").delete().eq("access_token", row.access_token);
    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    return NextResponse.json({ access_token: accessToken, token_type: "Bearer", expires_in: MCP_ACCESS_TOKEN_TTL_MS / 1000, refresh_token: newRefreshToken, scope: row.scope || undefined });
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
