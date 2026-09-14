import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const INTERNAL_LOGIN_DOMAIN = "qlcl-ttsg.com";

function toAuthEmail(login: string) {
  const value = login.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${INTERNAL_LOGIN_DOMAIN}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const login = String(body.login || body.username || "").trim();
  const password = String(body.password || "");

  if (!login || !password) {
    return NextResponse.json(
      { ok: false, error: "Thiếu tài khoản hoặc mật khẩu." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toAuthEmail(login),
    password,
  });

  if (error || !data.user || !data.session) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tài khoản hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: data.user.id,
  });
}
