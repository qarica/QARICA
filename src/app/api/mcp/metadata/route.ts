import { NextResponse } from "next/server";

// RFC 8414 (OAuth 2.0 Authorization Server Metadata) — Claude tự gọi
// GET /.well-known/oauth-authorization-server (rewrite sang đây, xem
// next.config.ts) khi người dùng bấm "Add Connector" để tìm 3 endpoint bên
// dưới, không cần cấu hình tay URL cụ thể.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/token`,
    registration_endpoint: `${origin}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
