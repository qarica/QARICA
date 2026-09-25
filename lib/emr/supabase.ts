// Supabase client dùng riêng cho module EMR Dashboard.
//
// LƯU Ý: nếu dự án QARICA đã có sẵn client dùng chung (ví dụ lib/supabase/server.ts
// hoặc lib/supabase/client.ts, theo kiểu @supabase/ssr), hãy XÓA file này và đổi các
// import "@/lib/emr/supabase" trong thư mục app/emr/** sang client hiện có của bạn,
// để module này dùng chung phiên đăng nhập / cookie với phần còn lại của QARICA.
//
// File này chỉ là bản dự phòng độc lập, dùng @supabase/supabase-js trực tiếp với
// service khóa "anon" — phù hợp khi đọc dữ liệu qua RLS ở phía server component.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, anonKey };
}

let serverCached: SupabaseClient | null = null;

/** Dùng trong server component (đọc dữ liệu cho các trang Tổng quan/Biểu mẫu/...). */
export function emrSupabase(): SupabaseClient {
  if (serverCached) return serverCached;
  const { url, anonKey } = envs();
  serverCached = createClient(url, anonKey, { auth: { persistSession: false } });
  return serverCached;
}

let browserCached: SupabaseClient | null = null;

/**
 * Dùng trong component "use client" (trang Nhập liệu, đổi trạng thái trên ma trận...).
 * persistSession/detectSessionInUrl bật để đọc lại phiên đăng nhập trình duyệt hiện có
 * — miễn là phần còn lại của QARICA cũng đăng nhập qua @supabase/supabase-js ở phía
 * client với cùng storage mặc định. Nếu QARICA dùng @supabase/ssr (session lưu ở cookie),
 * hãy thay hàm này bằng createBrowserClient() từ @supabase/ssr để dùng chung phiên.
 */
export function emrSupabaseBrowser(): SupabaseClient {
  if (browserCached) return browserCached;
  const { url, anonKey } = envs();
  browserCached = createClient(url, anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  return browserCached;
}
