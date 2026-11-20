import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Bước /authorize của OAuth: xác nhận client_id/redirect_uri hợp lệ, rồi
// điều hướng — chưa có phiên QARICA thì qua /login trước (tái dùng đúng
// trang đăng nhập + cơ chế ?next= đã có sẵn, không tạo màn đăng nhập
// riêng cho MCP); đã đăng nhập thì qua /mcp-consent để người dùng BẤM XÁC
// NHẬN rõ ràng (không tự động cấp quyền chỉ vì đang có sẵn phiên).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const responseType = url.searchParams.get("response_type") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";

  if (responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: client } = await admin.from("mcp_oauth_clients").select("client_id,redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_client_or_redirect_uri" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nextPath = `/api/mcp/authorize?${url.searchParams.toString()}`;
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(nextPath)}`, url.origin));
  }

  return NextResponse.redirect(new URL(`/mcp-consent?${url.searchParams.toString()}`, url.origin));
}
