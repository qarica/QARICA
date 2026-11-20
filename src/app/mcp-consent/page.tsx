import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Màn hình xác nhận kết nối Claude — người dùng PHẢI tự bấm "Cho phép",
// không tự động cấp chỉ vì đang có sẵn phiên đăng nhập QARICA (xem
// /api/mcp/authorize/route.ts, bước điều hướng tới đây).
export default async function McpConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/mcp-consent?${new URLSearchParams(sp as Record<string, string>).toString()}`)}`);

  const admin = createAdminClient();
  const { data: client } = await admin.from("mcp_oauth_clients").select("client_id,client_name,redirect_uris").eq("client_id", sp.client_id || "").maybeSingle();
  if (!client || !client.redirect_uris.includes(sp.redirect_uri || "")) {
    return (
      <main className="login-page">
        <section className="login-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="login-card">
            <p className="alert error">Yêu cầu kết nối không hợp lệ (client/redirect_uri không khớp).</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="login-card">
          <div className="login-card-header">
            <div>
              <strong>Kết nối Claude với QARICA</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <p>
            <strong>{client.client_name || "Ứng dụng Claude"}</strong> muốn kết nối vào tài khoản QARICA của bạn để đọc và cập nhật dữ liệu thay bạn (Note cá nhân, Công việc...). Mọi
            thao tác qua Claude sẽ dùng đúng quyền hạn tài khoản này.
          </p>
          <form method="POST" action="/api/mcp/authorize/confirm" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(sp).map(([k, v]) =>
              v ? <input key={k} type="hidden" name={k} value={v} /> : null,
            )}
            <button type="submit" name="decision" value="allow" className="button primary wide">
              Cho phép kết nối
            </button>
            <button type="submit" name="decision" value="deny" className="button secondary wide">
              Từ chối
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
