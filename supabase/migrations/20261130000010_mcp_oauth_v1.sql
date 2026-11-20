-- Yêu cầu thực tế: "Có add in claude vào qarica được ko" — kết nối tài
-- khoản Claude (claude.ai) vào QARICA như 1 Connector, để hỏi/thao tác dữ
-- liệu QARICA qua chat. Claude Connectors chỉ nhận remote MCP server qua
-- HTTPS, xác thực bằng OAuth 2.1 + PKCE (Dynamic Client Registration —
-- Claude tự đăng ký client khi người dùng bấm "Add"). 3 bảng server-only
-- cho toàn bộ luồng OAuth này — KHÔNG có policy RLS nào cho anon/
-- authenticated (chỉ service role trong các route /api/mcp/* được đụng
-- vào), vì đây là nơi lưu access/refresh token thật của Supabase (tương
-- đương phiên đăng nhập đầy đủ) — rò rỉ bảng này ra ngoài coi như lộ đăng
-- nhập của người dùng đó. Mã hoá access/refresh token của Supabase bằng
-- khoá server riêng (MCP_TOKEN_ENCRYPTION_KEY, xem src/lib/mcp-oauth-
-- crypto.ts) trước khi lưu, không lưu plaintext dù bảng đã khoá RLS.

create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

alter table public.mcp_oauth_clients enable row level security;

-- Mã xác thực tạm (authorization code) — sống tối đa 10 phút, dùng 1 lần
-- rồi xoá (xem /api/mcp/token). Gắn code_challenge (PKCE) từ lúc /authorize
-- để /token xác minh đúng cùng 1 client đã khởi tạo yêu cầu.
-- supabase_access_token_enc/supabase_refresh_token_enc (đã mã hoá, xem
-- src/lib/mcp-oauth-crypto.ts) chụp lại ĐÚNG phiên đăng nhập QARICA thật
-- của người vừa bấm "Cho phép" ở /mcp-consent (route /api/mcp/authorize/
-- confirm đọc session từ cookie request đó) — cần mang theo vì /token sau
-- này được GỌI TỪ SERVER CỦA CLAUDE, không có cookie trình duyệt nào kèm
-- theo để lấy lại session, nên phải "đóng gói" sẵn ở bước này.
create table if not exists public.mcp_oauth_codes (
  code text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text,
  supabase_access_token_enc text not null,
  supabase_refresh_token_enc text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.mcp_oauth_codes enable row level security;

create index if not exists mcp_oauth_codes_expires_idx on public.mcp_oauth_codes(expires_at);

-- access_token của MCP (không phải access_token của Supabase) — bản thân
-- nó chỉ là 1 chuỗi ngẫu nhiên tra cứu được, không phải JWT tự chứa thông
-- tin; mọi request MCP phải tra bảng này mỗi lần để biết còn hạn/thuộc
-- user nào. supabase_access_token/supabase_refresh_token (đã mã hoá) là
-- phiên đăng nhập QARICA thật của người đã "Allow" ở màn hình consent —
-- dùng để dựng 1 Supabase client đại diện ĐÚNG người đó khi gọi tool,
-- tôn trọng mọi RLS/has_permission như khi họ tự thao tác trên web.
create table if not exists public.mcp_oauth_tokens (
  access_token text primary key,
  refresh_token text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null,
  supabase_access_token_enc text not null,
  supabase_refresh_token_enc text not null,
  scope text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mcp_oauth_tokens enable row level security;

create index if not exists mcp_oauth_tokens_user_idx on public.mcp_oauth_tokens(user_id);
