import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Stage D1: wire Stage A5's sidebar_pinned_items data layer into the actual
// sidebar UI — a "Đã ghim" section at the top, pinned/unpinned via a small
// star toggle on every nav row. Deliberately scoped narrow for this file
// (the most heavily test-locked in the repo, per the redesign plan's own
// caution): no personalized greeting/date added to the shared topbar chrome
// (that's Dashboard-page content in the reference screenshot, not persistent
// app-shell chrome appropriate across 97 different page types) — only the
// one concrete, already-built, data-backed feature from Stage A.
describe("Sidebar 'Đã ghim' section (Stage D1): wires Stage A5's sidebar_pinned_items into the real sidebar UI", () => {
  const layout = read("src/app/(app)/layout.tsx");
  const shell = read("src/components/app-shell.tsx");
  const icon = read("src/components/icon.tsx");

  it("layout.tsx đọc sidebar_pinned_items qua client thường (RLS tự lọc theo owner_user_id), truyền xuống AppShell qua prop pinnedRoutes", () => {
    expect(layout).toContain('import { createClient } from "@/lib/supabase/server";');
    expect(layout).toContain('.from("sidebar_pinned_items").select("nav_route").eq("owner_user_id", user.id)');
    expect(layout).toContain("pinnedRoutes={pinnedRoutes}");
  });

  it("AppShell nhận prop pinnedRoutes (tuỳ chọn), khởi tạo state pinned từ đó", () => {
    expect(shell).toContain("pinnedRoutes?: string[];");
    expect(shell).toContain("const [pinned, setPinned] = useState<Set<string>>(() => new Set(pinnedRoutes ?? []));");
  });

  it("togglePin chặn navigation (preventDefault/stopPropagation) trước khi ghi, cập nhật lạc quan rồi mới gọi sidebar-pins.ts", () => {
    expect(shell).toContain('import { pinSidebarRoute, unpinSidebarRoute } from "@/lib/sidebar-pins";');
    expect(shell).toContain("event.preventDefault();");
    expect(shell).toContain("event.stopPropagation();");
    expect(shell).toContain("if (nowPinned) void pinSidebarRoute(user.id, user.organizationId || \"\", itemRoot, pinned.size);");
    expect(shell).toContain("else void unpinSidebarRoute(user.id, itemRoot);");
  });

  it("mục 'Đã ghim' chỉ hiện khi có ít nhất 1 mục đang ghim, lấy từ chính navGroups đã lọc quyền (không cần guard quyền riêng)", () => {
    expect(shell).toContain("const allNavItems = navGroups.flatMap((group) => group.children);");
    expect(shell).toContain("const pinnedItems = allNavItems.filter((item) => pinned.has(item.workspaceRoot || item.href.split(\"?\")[0]));");
    expect(shell).toContain('{pinnedItems.length ? <><div className="nav-label">Đã ghim</div>{pinnedItems.map((item) => renderChild(item, true, "brand"))}');
  });

  it("mỗi nav-link có nút ghim/bỏ ghim (icon star), dùng chung Icon component — không bịa SVG raw", () => {
    expect(shell).toContain('<button type="button" className={`nav-pin-toggle ${isPinned ? "pinned" : ""}`}');
    expect(shell).toContain('<Icon name="star" size={14} /></button>');
    expect(icon).toContain('"star":Star');
  });

  it("ẩn nút ghim khi sidebar thu gọn (không đủ chỗ, nhãn cũng đã ẩn) — rule CSS riêng, không sửa selector ẩn nhãn đã có sẵn (navigation-v2/sidebar-collapsed test đã khoá nguyên văn)", () => {
    expect(shell).toContain(".workspace-app .sidebar.collapsed .nav-pin-toggle{display:none}");
  });

  it("globals.css KHÔNG định nghĩa .nav-pin-toggle (CSS sống trong app-shell.tsx, đúng quy ước mọi CSS sidebar/topbar khác của file này)", () => {
    const globals = read("src/app/globals.css");
    expect(globals).not.toContain(".nav-pin-toggle");
  });
});
