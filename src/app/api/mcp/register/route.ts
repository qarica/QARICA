import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomOpaqueToken } from "@/lib/mcp-oauth-crypto";

// RFC 7591 (Dynamic Client Registration) — Claude tự gọi route này 1 lần
// khi người dùng bấm "Add Connector" lần đầu, lấy về client_id riêng của
// chính kết nối đó. Public client (không có client_secret) vì Claude không
// giữ được bí mật phía server — an toàn vì bắt buộc PKCE ở /authorize.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map((u: unknown) => String(u)) : [];
  if (!redirectUris.length || redirectUris.some((u: string) => !u.startsWith("https://") && !u.startsWith("http://localhost"))) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }
  const clientName = body.client_name ? String(body.client_name).trim().slice(0, 200) : null;

  const admin = createAdminClient();
  const clientId = randomOpaqueToken();
  const { error } = await admin.from("mcp_oauth_clients").insert({ client_id: clientId, client_name: clientName, redirect_uris: redirectUris });
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  return NextResponse.json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
