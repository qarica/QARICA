import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This repo's test convention avoids importing modules that reach across the
// "@/" path alias (Vitest here has no tsconfig-paths resolution — only
// Next's own build does), so Navigation V3 is verified the same way the rest
// of this codebase verifies non-trivially-unit-testable app/route wiring:
// structural assertions against the real source (see emr-security.test.ts,
// calendar-kind-filter.test.ts for the established pattern).
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const workspaceNav = readFileSync("src/lib/workspace-navigation.ts", "utf8");
const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");

const GROUP_IDS = ["operations", "quality-management", "digital-systems", "system-config"];

function groupBlock(source: string, id: string) {
  const start = source.indexOf(`id: "${id}"`);
  expect(start, `group "${id}" not found`).toBeGreaterThanOrEqual(0);
  const nextGroupStarts = GROUP_IDS
    .filter((other) => other !== id)
    .map((other) => source.indexOf(`id: "${other}"`, start + 1))
    .filter((i) => i > start);
  const end = nextGroupStarts.length ? Math.min(...nextGroupStarts) : source.indexOf("];", start);
  return source.slice(start, end);
}

describe("Navigation V3 — data model (src/lib/navigation.ts)", () => {
  it("defines exactly 4 primary groups", () => {
    for (const id of GROUP_IDS) expect(navigation.match(new RegExp(`id: "${id}"`, "g"))?.length).toBe(1);
    // no fifth group id besides these four
    expect(navigation.match(/id: "[a-z-]+"/g)?.length).toBe(4);
    expect(navigation).toContain('label: "ĐIỀU HÀNH CHẤT LƯỢNG"');
    expect(navigation).toContain('label: "QUẢN LÝ CHẤT LƯỢNG"');
    expect(navigation).toContain('label: "CHUYỂN ĐỔI SỐ & HỆ THỐNG"');
    expect(navigation).toContain('label: "CẤU HÌNH HỆ THỐNG"');
  });

  it("assigns the correct children to Group 1 — ĐIỀU HÀNH CHẤT LƯỢNG", () => {
    const block = groupBlock(navigation, "operations");
    for (const label of ["Tổng quan QLCL", "Việc của tôi", "Lịch QLCL", "Kế hoạch & Điều hành"]) {
      expect(block).toContain(`label: "${label}"`);
    }
    expect(block).not.toContain("Đo lường & Giám sát");
    expect(block).not.toContain("EMR");
  });

  it("assigns the correct children to Group 2 — QUẢN LÝ CHẤT LƯỢNG", () => {
    const block = groupBlock(navigation, "quality-management");
    for (const label of [
      "Đo lường & Giám sát", "Đánh giá & Kiểm tra", "Sự cố & Phản ánh", "Rủi ro & FMEA",
      "Khắc phục & CAPA", "Cải tiến chất lượng", "Kho minh chứng", "Báo cáo & Phân tích QLCL",
    ]) {
      expect(block).toContain(`label: "${label}"`);
    }
    expect(block).not.toContain('label: "EMR"');
    expect(block).not.toContain("Tổng quan QLCL");
  });

  it("Group 3 — CHUYỂN ĐỔI SỐ & HỆ THỐNG contains EMR only (Cấu hình hệ thống is no longer here)", () => {
    const block = groupBlock(navigation, "digital-systems");
    expect(block).toContain('label: "EMR", href: "/emr"');
    expect(block).not.toContain("Cấu hình hệ thống");
    expect(block).not.toContain("workspaceRoot: \"/admin\"");
  });

  it("Group 4 — CẤU HÌNH HỆ THỐNG is its own primary group, mapping to the existing Admin workspace", () => {
    const block = groupBlock(navigation, "system-config");
    expect(block).toContain('label: "Cấu hình hệ thống"');
    expect(block).toContain('workspaceRoot: "/admin"');
  });

  it("filters children by permission/anyPermissions and hides empty groups (RBAC preserved, never loosened)", () => {
    expect(navigation).toContain("if (child.permission && !permissionSet.has(child.permission)) return null;");
    expect(navigation).toContain("if (child.anyPermissions?.length && !child.anyPermissions.some((permission) => permissionSet.has(permission))) return null;");
    expect(navigation).toContain(".filter((group) => group.children.length > 0)");
  });

  it("resolves workspace-backed children via the existing workspaceLandingHref (no re-declared route/href for them)", () => {
    expect(navigation).toContain('import { workspaceLandingHref } from "@/lib/workspace-navigation";');
    expect(navigation).toContain("const landing = workspaceLandingHref(child.workspaceRoot, user);");
    for (const root of ["/plans", "/indicators", "/assessments", "/incidents", "/risks", "/findings", "/improvement/projects", "/evidence", "/admin"]) {
      expect(navigation).toContain(`workspaceRoot: "${root}"`);
      expect(workspaceNav).toContain(`root: "${root}"`);
    }
  });

  it("Admin sidebar entry is workspaceRoot-based, not a hand-maintained permission list (single source of truth)", () => {
    expect(navigation).not.toContain('anyPermissions: ["users.manage", "departments.manage", "permissions.manage", "system.manage"]');
  });

  it("collapses EMR to a single sidebar entry — the 9 EMR subcategories are not exposed in the main sidebar", () => {
    expect(navigation).not.toContain("EMR_CATEGORIES");
    expect(navigation.match(/href: "\/emr/g)?.length).toBe(1);
  });

  it("does not duplicate Admin's internal tabs into the main sidebar", () => {
    expect(navigation.match(/workspaceRoot: "\/admin"/g)?.length).toBe(1);
    for (const adminTabLabel of ["Người dùng", "Nhóm phân công", "Khoa / Phòng", "Vai trò & Phân quyền", "Danh mục", "Nhật ký hệ thống"]) {
      expect(navigation).not.toContain(adminTabLabel);
    }
  });
});

describe("Navigation V3 — layout wiring", () => {
  it("the protected layout supplies groups (not the old flat NAV_SECTIONS) to AppShell", () => {
    expect(layout).toContain("visibleNavGroups");
    expect(layout).not.toContain("visibleNav(");
    expect(layout).toContain("navGroups=");
  });
});

describe("Navigation V3 — accordion behavior (src/components/app-shell.tsx)", () => {
  it("keeps a single expanded-group id (true accordion, not independent per-group booleans)", () => {
    expect(shell).toContain("expandedGroupId");
    expect(shell.match(/useState<string \| null>/g)?.length).toBe(1);
  });

  it("auto-expands the group containing the active route, on mount and on every navigation", () => {
    expect(shell).toContain("useState<string | null>(() => resolveActiveGroupId(pathname, navGroups, currentWorkspaceRoot));");
    expect(shell).toContain("useEffect(() => { setExpandedGroupId(resolveActiveGroupId(pathname, navGroups, workspaceRootForPath(pathname))); }, [pathname, navGroups]);");
  });

  it("does not hard-code a 3-group assumption — group rendering is generic over navGroups", () => {
    expect(shell).toContain("navGroups.map((group) =>");
    expect(shell).not.toMatch(/navGroups\.length\s*===\s*3/);
    expect(shell).not.toMatch(/navGroups\[0\]|navGroups\[1\]|navGroups\[2\]/);
  });

  it("toggling a group collapses it when already expanded, and never navigates", () => {
    expect(shell).toContain('function toggleGroup(id: string) { setExpandedGroupId((current) => (current === id ? null : id)); }');
    expect(shell).toContain('<button type="button" className="nav-group-header"');
  });

  it("renders child links from existing routes only (no new routes minted for the parent groups)", () => {
    expect(shell).toContain('href={item.href}');
    expect(shell).not.toMatch(/href="\/nav-group|href=\{`\/group/);
  });

  it("uses one shared active-route resolver instead of duplicated ad-hoc checks (the old Incidents dual-active-state bug class)", () => {
    const activeCheckPattern = 'pathname === baseHref || (baseHref !== "/dashboard"';
    const occurrences = shell.split(activeCheckPattern).length - 1;
    expect(occurrences).toBe(1);
    expect(shell).toContain("function isChildActive(pathname: string, child: NavItem, currentWorkspaceRoot: string | null)");
    expect(shell).toContain("function resolveActiveGroupId(pathname: string, navGroups: NavGroup[], currentWorkspaceRoot: string | null)");
  });

  it("preserves the existing workspace-strip for internal EMR/Admin sub-navigation (not duplicated into the sidebar)", () => {
    expect(shell).toContain("workspace-strip");
    expect(shell).toContain("workspace.tabs.length > 1");
    expect(shell).toContain("isWorkspaceTabActive(pathname, tab.href)");
  });

  it("provides a collapsed-rail flyout so authorized children stay reachable without expanding the whole sidebar", () => {
    expect(shell).toContain("nav-group-flyout");
    expect(shell).toContain(".sidebar.collapsed .nav-group-children{display:none!important}");
    expect(shell).toContain(".workspace-app .sidebar.collapsed .nav-group:hover .nav-group-flyout,.workspace-app .sidebar.collapsed .nav-group:focus-within .nav-group-flyout{display:block}");
  });

  it("keeps flyouts off the mobile drawer breakpoint to avoid off-viewport popovers", () => {
    expect(shell).toContain("@media(max-width:860px){");
    expect(shell).toContain(".workspace-app .nav-group-flyout{display:none!important}");
  });

  it("does not reintroduce a separate AdminTabs component", () => {
    expect(shell).not.toContain("AdminTabs");
  });

  it("mobile drawer child touch targets meet the ~44px minimum", () => {
    expect(shell).toContain(".workspace-app .nav-child-link{min-height:44px;padding:11px 10px}");
  });

  it("gives the parent group header stronger visual weight than child links (Level 1 vs Level 2), with high-specificity colors that survive legacy theme !important overrides on the shared .nav-link class", () => {
    expect(shell).toContain(".nav-group-header{");
    expect(shell).toContain(".nav-group.active-context>.nav-group-header{");
    // .workspace-app.workspace-app doubles specificity so these always win,
    // regardless of stylesheet load order against other files' `.nav-link{color:...!important}` rules
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-group-header,\.workspace-app\.workspace-app \.nav-group-label\{color:#0f172a!important;font-weight:800!important;font-size:13\.5px!important/);
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-child-link,\.workspace-app\.workspace-app \.nav-child-link \.nav-link-label\{color:#7c8a9a!important;font-weight:600!important;font-size:12px!important\}/);
    // parent (13.5px/800) must be strictly bolder AND larger than child (12px/600)
    expect(13.5).toBeGreaterThan(12);
    expect(800).toBeGreaterThan(600);
  });

  it("promotes a single-child group (EMR; Cấu hình hệ thống) to a plain top-level link instead of a chevron accordion with nothing to expand", () => {
    expect(shell).toContain("if (group.children.length === 1) return renderChild(group.children[0], true);");
    expect(shell).toContain("nav-link nav-group-link");
    // the promoted link still carries .nav-link so it inherits the same
    // collapsed-rail / active-state / touch-target machinery as every other item
    expect(shell).toContain("asGroupLink ? `nav-link nav-group-link");
  });

  it("a promoted single-child link reads as Level 1 (bold navy), not Level 2 (light slate)", () => {
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-group-link\{color:#0f172a!important;font-weight:800!important;font-size:13\.5px!important\}/);
  });
});
