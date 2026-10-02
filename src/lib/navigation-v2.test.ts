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

const GROUP_IDS = [
  "operations",
  "procurement",
  "physician-license",
  "incoming-documents",
  "procedure-training",
  "personal-workspace",
  "quality-management",
  "digital-systems",
  "system-config",
];

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
  it("defines exactly 9 primary groups — 5 single-item groups promoted out of ĐIỀU HÀNH CHẤT LƯỢNG per explicit request (mobile sidebar screenshot)", () => {
    for (const id of GROUP_IDS) expect(navigation.match(new RegExp(`id: "${id}"`, "g"))?.length).toBe(1);
    // no tenth group id besides these nine
    expect(navigation.match(/id: "[a-z-]+"/g)?.length).toBe(9);
    expect(navigation).toContain('label: "ĐIỀU HÀNH CHẤT LƯỢNG"');
    expect(navigation).toContain('label: "QUẢN LÝ CHẤT LƯỢNG"');
    expect(navigation).toContain('label: "CHUYỂN ĐỔI SỐ & HỆ THỐNG"');
    expect(navigation).toContain('label: "CẤU HÌNH HỆ THỐNG"');
  });

  it("assigns the correct children to Group 1 — ĐIỀU HÀNH CHẤT LƯỢNG (the 5 single-item groups no longer live here)", () => {
    const block = groupBlock(navigation, "operations");
    for (const label of ["Tổng quan QLCL", "Việc của tôi", "Lịch QLCL", "Kế hoạch & Điều hành"]) {
      expect(block).toContain(`label: "${label}"`);
    }
    expect(block).not.toContain("Đo lường & Giám sát");
    expect(block).not.toContain("EMR");
    for (const moved of ["Mua sắm & Sửa chữa", "Quản lý hành nghề", "Công văn đến", "Đào tạo quy trình", "Cá nhân"]) {
      expect(block).not.toContain(`label: "${moved}"`);
    }
  });

  it("promotes Mua sắm & Sửa chữa, Quản lý hành nghề, Công văn đến, Đào tạo quy trình and Cá nhân to their own top-level single-item groups", () => {
    const expectations: [string, string, string][] = [
      ["procurement", "Mua sắm & Sửa chữa", "/procurement"],
      ["physician-license", "Quản lý hành nghề", "/physician-license"],
      ["incoming-documents", "Công văn đến", "/incoming-documents"],
      ["procedure-training", "Đào tạo quy trình", "/procedure-trainings"],
      ["personal-workspace", "Cá nhân", "/me"],
    ];
    for (const [id, label, href] of expectations) {
      const block = groupBlock(navigation, id);
      expect(block).toContain(`label: "${label}", href: "${href}"`);
    }
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

  it("collapses EMR to a single sidebar entry — the EMR subcategories are not exposed in the main sidebar", () => {
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
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-group-header,\.workspace-app\.workspace-app \.nav-group-label\{color:#7c3aed!important;font-weight:800!important;font-size:13\.5px!important/);
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-child-link,\.workspace-app\.workspace-app \.nav-child-link \.nav-link-label\{color:#60a5fa!important;font-weight:600!important;font-size:12px!important\}/);
    // parent (13.5px/800) must be strictly bolder AND larger than child (12px/600)
    expect(13.5).toBeGreaterThan(12);
    expect(800).toBeGreaterThan(600);
  });

  it("colors Level 1 (group headers, promoted single-child links) light purple and Level 2 (child links) light blue, as a distinct hue per level rather than just a weight/size difference", () => {
    // Level 1: violet family
    expect(shell).toContain(".nav-group-header,.workspace-app.workspace-app .nav-group-label{color:#7c3aed!important");
    expect(shell).toContain(".nav-group-link{color:#7c3aed!important");
    expect(shell).toContain(".nav-group.active-context>.nav-group-header{background:#f5f3ff}");
    expect(shell).toContain(".nav-group.active-context>.nav-group-header .nav-group-icon{color:#7c3aed!important}");
    // Level 2: blue family, distinct from Level 1's violet
    expect(shell).toContain(".nav-child-link,.workspace-app.workspace-app .nav-child-link .nav-link-label{color:#60a5fa!important");
    expect(shell).toContain(".nav-child-link .nav-icon{color:#60a5fa!important");
  });

  it("promotes a single-child group (EMR; Cấu hình hệ thống) to a plain top-level link instead of a chevron accordion with nothing to expand", () => {
    expect(shell).toContain("if (group.children.length === 1) return renderChild(group.children[0], true);");
    expect(shell).toContain("nav-link nav-group-link");
    // the promoted link still carries .nav-link so it inherits the same
    // collapsed-rail / active-state / touch-target machinery as every other item
    expect(shell).toContain("asGroupLink ? `nav-link nav-group-link");
  });

  it("a promoted single-child link reads as Level 1 (bold violet), not Level 2 (light blue)", () => {
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-group-link\{color:#7c3aed!important;font-weight:800!important;font-size:13\.5px!important;margin:6px 10px!important\}/);
  });

  it("survives qms-enterprise-redesign.css's competing !important .nav-link{margin:2px 6px} and generic .nav-icon{width:27px;height:27px} rules — a second real collision found via real-device screenshots after the first fix (colors only) still left EMR/Cấu hình hệ thống visually indistinguishable from a child row, because their margin and icon size were still being silently overridden", () => {
    // promoted single-child link must align flush with group headers (10px
    // horizontal margin, same as .nav-group-header) and get the same 6px
    // vertical breathing room a full group section gets from .nav-group,
    // which it never inherits since it isn't wrapped in a .nav-group div.
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-group-link\{[^}]*margin:6px 10px!important/);
    // real child links must keep their 26px left indent under !important,
    // not just their color — otherwise indentation-based hierarchy never
    // actually renders in production.
    expect(shell).toContain(".workspace-app.workspace-app .nav-child-link{margin:1px 10px 1px 26px!important}");
    // child icons must actually shrink to 20px under !important — the generic
    // .nav-icon{width:27px;height:27px!important} rule otherwise forces every
    // icon (group and child alike) to the same size, erasing the size cue.
    expect(shell).toMatch(/\.workspace-app\.workspace-app \.nav-child-link \.nav-icon\{color:#60a5fa!important;width:20px!important;height:20px!important;flex:0 0 20px!important\}/);
  });

  it("keeps the collapsed-rail flyout's compact child margin from being overridden by the new !important 26px indent (the flyout is a small popover, not the full list — there is no parent row to indent under inside it)", () => {
    expect(shell).toContain(".workspace-app.workspace-app .sidebar.collapsed .nav-group-flyout .nav-child-link{margin:1px 4px!important}");
  });
});
