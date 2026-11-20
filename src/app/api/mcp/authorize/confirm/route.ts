import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, randomOpaqueToken } from "@/lib/mcp-oauth-crypto";

const CODE_TTL_MS = 10 * 60 * 1000;

// Xử lý nút "Cho phép"/"Từ chối" ở /mcp-consent — PHẢI có phiên QARICA thật
// (không tin field ẩn user_id nào cả, luôn lấy từ session hiện tại) để
// authorization code gắn đúng người đang thật sự bấm xác nhận.
export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const state = form.get("state") ? String(form.get("state")) : null;
  const scope = form.get("scope") ? String(form.get("scope")) : null;
  const codeChallenge = String(form.get("code_challenge") || "");
  const codeChallengeMethod = String(form.get("code_challenge_method") || "S256");
  const decision = String(form.get("decision") || "");

  const admin = createAdminClient();
  const { data: client } = await admin.from("mcp_oauth_clients").select("client_id,redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_client_or_redirect_uri" }, { status: 400 });
  }

  const redirectUrl = new URL(redirectUri);
  if (decision !== "allow") {
    redirectUrl.searchParams.set("error", "access_denied");
    if (state) redirectUrl.searchParams.set("state", state);
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 400 });

  const code = randomOpaqueToken();
  const { error } = await admin.from("mcp_oauth_codes").insert({
    code,
    client_id: clientId,
    user_id: user.id,
    organization_id: profile.organization_id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    supabase_access_token_enc: encryptToken(session.access_token),
    supabase_refresh_token_enc: encryptToken(session.refresh_token),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  return NextResponse.redirect(redirectUrl);
}
