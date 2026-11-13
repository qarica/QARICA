import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const MIGRATION = "supabase/migrations/20261130000002_sidebar_pinned_items_v1.sql";

// Ghim menu sidebar — ưu tiên cá nhân, cần đồng bộ qua mọi thiết bị như mọi
// ưu tiên cá nhân khác trong app (personal_reminders là tiền lệ đã có) nên
// dùng bảng riêng + RLS, KHÔNG dùng localStorage (sẽ lệch giữa các thiết bị
// của cùng 1 người, phá nguyên tắc "1 nguồn sự thật").
//
// CHÚ Ý theo CLAUDE.md: file migration tồn tại trong repo KHÔNG đồng nghĩa
// đã áp lên Supabase sống — bảng này mới chỉ có trong repo tại thời điểm
// Stage A, CHƯA verify trực tiếp qua pg_policy trên Supabase sống (MCP
// Supabase trong phiên này đang mất kết nối — xem ghi chú cuối báo cáo
// Stage A). Không coi bảng này là "đã xong" cho tới khi verify trực tiếp.
describe("Ghim menu sidebar: bảng riêng + RLS theo chủ sở hữu, cùng kiểu personal_reminders", () => {
  it("migration tạo đúng 1 bảng mới sidebar_pinned_items, unique theo (owner_user_id, nav_route)", () => {
    const migration = read(MIGRATION);
    expect(migration).toContain("create table if not exists public.sidebar_pinned_items");
    expect(migration).toContain("unique (owner_user_id, nav_route)");
  });

  it("bật RLS và có đủ 4 policy select/insert/update/delete, tất cả khoá theo auth.uid() = owner_user_id (không ai xem/sửa được ghim của người khác)", () => {
    const migration = read(MIGRATION);
    expect(migration).toContain("alter table public.sidebar_pinned_items enable row level security");
    for (const action of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`create policy sidebar_pinned_items_owner_${action} on public.sidebar_pinned_items`);
    }
    expect(migration.match(/\(select auth\.uid\(\)\) = owner_user_id/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("insert/update đều xác thực organization_id khớp đúng profile đang hoạt động của người ghim (chặn ghi sai tổ chức), giống personal_reminders_owner_insert", () => {
    const migration = read(MIGRATION);
    expect(migration.match(/p\.organization_id=sidebar_pinned_items\.organization_id/g)?.length).toBe(2);
    expect(migration).toContain("p.is_active=true");
  });

  it("src/lib/sidebar-pins.ts gọi thẳng Supabase client phía trình duyệt (dựa vào RLS), không bịa route API riêng — đúng quy ước personal-reminders.tsx đã dùng", () => {
    const source = read("src/lib/sidebar-pins.ts");
    expect(source).toContain('import { createClient } from "@/lib/supabase/client";');
    expect(source).toContain('.from("sidebar_pinned_items")');
    expect(source).toContain("export async function listSidebarPins(");
    expect(source).toContain("export async function pinSidebarRoute(");
    expect(source).toContain("export async function unpinSidebarRoute(");
  });

  it("pinSidebarRoute/unpinSidebarRoute đều lọc theo owner_user_id (không truyền thẳng id bản ghi tuỳ ý)", () => {
    const source = read("src/lib/sidebar-pins.ts");
    expect(source).toContain("owner_user_id: userId,");
    expect(source).toContain('.eq("owner_user_id", userId).eq("nav_route", navRoute)');
  });
});
