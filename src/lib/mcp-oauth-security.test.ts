import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Yêu cầu thực tế: "Có add in claude vào qarica được ko" — kết nối tài
// khoản Claude vào QARICA như 1 Connector (MCP server + OAuth 2.1/PKCE).
// Đây là subsystem mới, rủi ro cao nếu sai (token MCP tương đương 1 phiên
// đăng nhập đầy đủ) — khoá chặt bằng test cho từng điểm chốt an toàn.
describe("MCP/OAuth connector: hạ tầng xác thực", () => {
  it("3 bảng OAuth đều bật RLS và KHÔNG có policy nào cho anon/authenticated (chỉ service role trong route /api/mcp/* được đụng vào)", () => {
    const migration = read("supabase/migrations/20261130000010_mcp_oauth_v1.sql");
    expect(migration).toContain("alter table public.mcp_oauth_clients enable row level security;");
    expect(migration).toContain("alter table public.mcp_oauth_codes enable row level security;");
    expect(migration).toContain("alter table public.mcp_oauth_tokens enable row level security;");
    expect(migration).not.toContain("create policy");
  });

  it("access/refresh token thật của Supabase luôn được mã hoá trước khi lưu, không bao giờ lưu plaintext", () => {
    const migration = read("supabase/migrations/20261130000010_mcp_oauth_v1.sql");
    expect(migration).toContain("supabase_access_token_enc text not null");
    expect(migration).toContain("supabase_refresh_token_enc text not null");

    const confirmRoute = read("src/app/api/mcp/authorize/confirm/route.ts");
    expect(confirmRoute).toContain("supabase_access_token_enc: encryptToken(session.access_token)");
    expect(confirmRoute).toContain("supabase_refresh_token_enc: encryptToken(session.refresh_token)");

    const userClient = read("src/lib/supabase/mcp-user-client.ts");
    expect(userClient).toContain("decryptToken(row.supabase_access_token_enc)");
    expect(userClient).toContain("decryptToken(row.supabase_refresh_token_enc)");
  });

  it("/authorize bắt buộc PKCE S256 + client_id/redirect_uri phải khớp bản ghi đã đăng ký (chống open redirect)", () => {
    const route = read("src/app/api/mcp/authorize/route.ts");
    expect(route).toContain('if (responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256")');
    expect(route).toContain("!client.redirect_uris.includes(redirectUri)");
  });

  it("/authorize chưa đăng nhập thì qua /login?next=..., đã đăng nhập thì PHẢI qua /mcp-consent để người dùng tự bấm xác nhận (không tự động cấp quyền)", () => {
    const route = read("src/app/api/mcp/authorize/route.ts");
    expect(route).toContain('`/login?next=${encodeURIComponent(nextPath)}`');
    expect(route).toContain("/mcp-consent?");
  });

  it("/authorize/confirm luôn lấy user từ session hiện tại (không tin field ẩn nào), và chặn khi redirect_uri không khớp client đã đăng ký", () => {
    const route = read("src/app/api/mcp/authorize/confirm/route.ts");
    expect(route).toContain("const { data: { user } } = await supabase.auth.getUser();");
    expect(route).toContain("!client.redirect_uris.includes(redirectUri)");
  });

  it("/token xác minh PKCE verifier, client_id/redirect_uri khớp, và mã dùng 1 lần (xoá ngay sau khi đọc)", () => {
    const route = read("src/app/api/mcp/token/route.ts");
    expect(route).toContain('await admin.from("mcp_oauth_codes").delete().eq("code", code);');
    expect(route).toContain("verifyPkce(body.code_verifier || \"\", row.code_challenge, row.code_challenge_method)");
    expect(route).toContain("row.client_id !== body.client_id || row.redirect_uri !== body.redirect_uri");
  });

  it("/token refresh_token xoay vòng (cấp token mới, xoá bản ghi cũ) — không tái dùng được 1 refresh_token 2 lần", () => {
    const route = read("src/app/api/mcp/token/route.ts");
    expect(route).toContain('await admin.from("mcp_oauth_tokens").delete().eq("access_token", row.access_token);');
  });

  it("/api/mcp (JSON-RPC) bắt buộc Authorization: Bearer và tra cứu đúng người dùng qua userScopedClientFromMcpToken — không có đường tắt service-role nào cho tool", () => {
    const route = read("src/app/api/mcp/route.ts");
    expect(route).toContain('authHeader.startsWith("Bearer ")');
    expect(route).toContain("userScopedClientFromMcpToken(token)");
    expect(route).toContain("callMcpTool(auth.supabase, auth.userId, toolName, args)");
  });

  it("metadata OAuth (RFC 8414) phục vụ qua rewrite /.well-known/oauth-authorization-server", () => {
    const config = read("next.config.ts");
    expect(config).toContain('source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/metadata"');
    const route = read("src/app/api/mcp/metadata/route.ts");
    expect(route).toContain("authorization_endpoint: `${origin}/api/mcp/authorize`");
    expect(route).toContain("code_challenge_methods_supported: [\"S256\"]");
  });

  it("list_personal_notes/update/delete luôn scope theo owner_user_id của CHÍNH người gọi — không nhận user_id/id tuỳ ý từ tham số tool", () => {
    const lib = read("src/lib/mcp-tools.ts");
    expect(lib).toContain('.eq("owner_user_id", userId)');
    expect(lib).toContain('.eq("id", id).eq("owner_user_id", userId)');
    expect(lib).toContain('.delete({ count: "exact" }).eq("id", id).eq("owner_user_id", userId)');
  });

  it("list_my_assigned_tasks chỉ đọc (không có tool ghi/transition nào cho công việc trong giai đoạn này) và scope theo assignee_user_id", () => {
    const lib = read("src/lib/mcp-tools.ts");
    expect(lib).toContain('.from("vw_actions_dashboard").select(ACTION_SELECT).eq("assignee_user_id", userId)');
    expect(lib).not.toContain("qlcl_start_action_department_execution_v1");
    expect(lib).not.toContain("qlcl_verify_action_v1");
  });
});
