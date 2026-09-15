import { NextResponse } from "next/server";
import { getPublicSupabaseKey, getPublicSupabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

// Endpoint này công khai (không đăng nhập cũng gọi được) để phục vụ giám
// sát uptime tự động. Vì vậy KHÔNG trả về chi tiết hạ tầng (tên miền
// Supabase, nội dung phản hồi thật) ra ngoài — chỉ trả đúng/sai để tránh
// lộ thông tin không cần thiết cho người ngoài. Chi tiết đầy đủ vẫn được
// ghi vào log server (console.error) để người quản trị tự tra khi cần,
// xem trong Vercel > Logs.
export async function GET() {
  const url = getPublicSupabaseUrl().replace(/\/+$/, "");
  const key = getPublicSupabaseKey();

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[health/auth] upstream not ok", { status: response.status, body: body.slice(0, 300) });
    }

    return NextResponse.json({ ok: response.ok }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    console.error("[health/auth] upstream fetch failed", error);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
