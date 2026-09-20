import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const INTERNAL_LOGIN_DOMAIN = "qarica.com";

// Tối đa 8 lần thử sai trong 5 phút, tính theo IP + tài khoản đang thử.
// Sau khi vượt, phải chờ đủ cửa sổ thời gian mới được thử lại.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

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

  const ip = getClientIp(request);
  const rateLimitKey = `login:${ip}:${login.toLowerCase()}`;
  const limitResult = rateLimit(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS);

  if (!limitResult.allowed) {
    const minutes = Math.ceil(limitResult.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        ok: false,
        error: `Bạn đã thử đăng nhập sai quá nhiều lần. Vui lòng thử lại sau khoảng ${minutes} phút.`,
      },
      { status: 429, headers: { "Retry-After": String(limitResult.retryAfterSeconds) } },
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
        debug: error ? `${error.status ?? ""} ${error.code ?? ""} ${error.message}`.trim() : "Không có lỗi nhưng thiếu user/session.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: data.user.id,
  });
}
