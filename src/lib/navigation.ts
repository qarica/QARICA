import type { NavGroup, NavItem, UserContext } from "@/lib/types";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { workspaceLandingHref } from "@/lib/workspace-navigation";

type WorkspaceChildDef = { label: string; icon: string; workspaceRoot: string };
type DirectChildDef = { label: string; icon: string; href: string; permission?: string; anyPermissions?: string[] };
type ChildDef = WorkspaceChildDef | DirectChildDef;

function isWorkspaceChild(child: ChildDef): child is WorkspaceChildDef {
  return "workspaceRoot" in child;
}

type NavGroupDef = { id: string; label: string; icon: string; children: ChildDef[]; footer?: boolean };

// Navigation V3: main sidebar presentation only. Groups children under four
// accordion sections; underlying routes/permissions/workspace semantics are
// unchanged. EMR and Admin keep their own internal navigation (EMR command
// center readiness grid, Admin workspace-strip) — those screens are reached
// through their single sidebar entry, not duplicated here. Admin's entry is
// workspaceRoot-based (not a hand-maintained anyPermissions list) so its
// visibility always tracks the real per-tab permissions declared once in
// workspace-navigation.ts — one source of truth for who can see it.
//
// `footer: true` groups render in a visually separated block at the bottom
// of the sidebar's main menu list (below a divider), not interleaved with
// the organization-wide business modules above — utility destinations
// (Cấu hình hệ thống) read as a distinct tier from the shared QLCL/EMR/
// procurement-style modules.
//
// "Việc của tôi" and "Sổ tay cá nhân" are intentionally NOT in this sidebar
// at all (explicit request, 2026-10-15): they are personal/always-on tools,
// not organization-wide modules, so hard-coding them into the master menu
// buries them one accordion click away like everything else here. "Việc của
// tôi" lives in the topbar (AppShell, next to the notification bell) —
// always one click away regardless of which module is open. "Sổ tay cá
// nhân" is reachable through the floating quick-capture button
// (GlobalQuickCapture, rendered in the (app) layout) so a note/to-do can be
// captured from any screen without navigating away first; /me remains the
// full notebook page, linked from both.
//
// "Lịch QLCL" moved out of the ĐIỀU HÀNH CHẤT LƯỢNG accordion the same way
// (explicit request: "dời Calendar thành 1 nút riêng để dễ xem lịch") — it
// now has its own topbar icon button (AppShell, next to "Việc của tôi"),
// reachable in one click instead of expand-group-then-click. The topbar
// button is gated on the same permission set /calendar/page.tsx itself
// checks (hasAnyPermission over 8 codes), not just dashboard.view — closing
// a pre-existing gap where a user with e.g. only plans.manage could open
// /calendar by URL but never saw it in the old sidebar entry.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "operations",
    label: "ĐIỀU HÀNH CHẤT LƯỢNG",
    icon: "layout-dashboard",
    children: [
      { label: "Tổng quan QLCL", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Kế hoạch & Điều hành", icon: "target", workspaceRoot: "/plans" },
    ],
  },
  {
    id: "quality-management",
    label: "QUẢN LÝ CHẤT LƯỢNG",
    icon: "shield-check",
    children: [
      { label: "Đo lường & Giám sát", icon: "gauge", workspaceRoot: "/indicators" },
      { label: "Đánh giá & Kiểm tra", icon: "clipboard-check", workspaceRoot: "/assessments" },
      { label: "Sự cố & Phản ánh", icon: "shield-alert", workspaceRoot: "/incidents" },
      { label: "Rủi ro & FMEA", icon: "triangle-alert", workspaceRoot: "/risks" },
      { label: "Khắc phục & CAPA", icon: "refresh-cw", workspaceRoot: "/findings" },
      { label: "Cải tiến chất lượng", icon: "lightbulb", workspaceRoot: "/improvement/projects" },
      { label: "Kho minh chứng", icon: "folder-check", workspaceRoot: "/evidence" },
      { label: "Báo cáo & Phân tích QLCL", href: "/analytics", icon: "trending-up", permission: "reports.analytics" },
    ],
  },
  {
    id: "hsba-audit",
    label: "AUDIT HSBA",
    icon: "list-checks",
    children: [
      { label: "AUDIT HSBA", href: "/hsba-audit", icon: "list-checks", permission: "hsba_audit.view" },
    ],
  },
  {
    id: "digital-systems",
    label: "BỆNH ÁN ĐIỆN TỬ",
    icon: "network",
    // Explicit request: show all 11 EMR destinations as individual sidebar
    // rows instead of EMR's own horizontal EmrWorkspaceNav strip (removed).
    // Generated from EMR_CATEGORIES (single source of truth, also used by
    // the EMR dashboard readiness grid) instead of a hand-duplicated list,
    // so a category added/renamed there never has to be repeated here.
    children: [
      { label: "Tổng quan EMR", href: "/emr", icon: "layout-dashboard", permission: "emr.view" },
      { label: "Timeline", href: "/emr/timeline", icon: "chart-spline", permission: "emr.view" },
      ...EMR_CATEGORIES.map((c) => ({ label: c.label, href: `/emr/${c.slug}`, icon: c.icon, permission: "emr.view" })),
    ],
  },
  {
    id: "physician-license",
    label: "THEO DÕI HÀNH NGHỀ",
    icon: "badge-check",
    children: [
      { label: "THEO DÕI HÀNH NGHỀ", href: "/physician-license", icon: "badge-check", permission: "physician_license.view" },
    ],
  },
  {
    id: "incoming-documents",
    label: "QUẢN LÝ CÔNG VĂN",
    icon: "file-input",
    children: [
      { label: "QUẢN LÝ CÔNG VĂN", href: "/incoming-documents", icon: "file-input", permission: "incoming_documents.view" },
    ],
  },
  {
    id: "document-publications",
    label: "KIỂM SOÁT TÀI LIỆU",
    icon: "file-text",
    children: [
      { label: "KIỂM SOÁT TÀI LIỆU", href: "/document-publications", icon: "file-text", permission: "document_publication.view" },
    ],
  },
  {
    id: "procedure-training",
    label: "ĐÀO TẠO QUY TRÌNH",
    icon: "book-open",
    children: [
      { label: "ĐÀO TẠO QUY TRÌNH", href: "/procedure-trainings", icon: "book-open", permission: "procedure_training.view" },
    ],
  },
  {
    id: "procurement",
    label: "MUA SẮM & SỬA CHỮA",
    icon: "archive",
    children: [
      { label: "MUA SẮM & SỬA CHỮA", href: "/procurement", icon: "archive", permission: "procurement.view" },
    ],
  },
  {
    id: "system-config",
    label: "CẤU HÌNH HỆ THỐNG",
    icon: "settings",
    footer: true,
    children: [
      { label: "CẤU HÌNH HỆ THỐNG", icon: "settings", workspaceRoot: "/admin" },
    ],
  },
];

function resolveChild(child: ChildDef, user: UserContext): NavItem | null {
  const permissionSet = new Set(user.permissions);
  if (isWorkspaceChild(child)) {
    const landing = workspaceLandingHref(child.workspaceRoot, user);
    return landing ? { label: child.label, href: landing, icon: child.icon, workspaceRoot: child.workspaceRoot } : null;
  }
  if (child.permission && !permissionSet.has(child.permission)) return null;
  if (child.anyPermissions?.length && !child.anyPermissions.some((permission) => permissionSet.has(permission))) return null;
  return { label: child.label, href: child.href, icon: child.icon };
}

export function visibleNavGroups(user: UserContext): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    footer: group.footer,
    children: group.children.map((child) => resolveChild(child, user)).filter((item): item is NavItem => item !== null),
  })).filter((group) => group.children.length > 0);
}
