import type { NavGroup, NavItem, UserContext } from "@/lib/types";
import { workspaceLandingHref } from "@/lib/workspace-navigation";

type WorkspaceChildDef = { label: string; icon: string; workspaceRoot: string };
type DirectChildDef = { label: string; icon: string; href: string; permission?: string; anyPermissions?: string[] };
type ChildDef = WorkspaceChildDef | DirectChildDef;

function isWorkspaceChild(child: ChildDef): child is WorkspaceChildDef {
  return "workspaceRoot" in child;
}

type NavGroupDef = { id: string; label: string; icon: string; children: ChildDef[] };

// Navigation V3: main sidebar presentation only. Groups children under four
// accordion sections; underlying routes/permissions/workspace semantics are
// unchanged. EMR and Admin keep their own internal navigation (EMR command
// center readiness grid, Admin workspace-strip) — those screens are reached
// through their single sidebar entry, not duplicated here. Admin's entry is
// workspaceRoot-based (not a hand-maintained anyPermissions list) so its
// visibility always tracks the real per-tab permissions declared once in
// workspace-navigation.ts — one source of truth for who can see it.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "operations",
    label: "ĐIỀU HÀNH CHẤT LƯỢNG",
    icon: "layout-dashboard",
    children: [
      { label: "Tổng quan QLCL", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Việc của tôi", href: "/tasks", icon: "inbox", permission: "tasks.view" },
      { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
      { label: "Kế hoạch & Điều hành", icon: "target", workspaceRoot: "/plans" },
      { label: "Không gian riêng", href: "/me", icon: "book-open" },
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
    id: "digital-systems",
    label: "CHUYỂN ĐỔI SỐ & HỆ THỐNG",
    icon: "network",
    children: [
      { label: "EMR", href: "/emr", icon: "layout-dashboard", permission: "emr.view" },
    ],
  },
  {
    id: "system-config",
    label: "CẤU HÌNH HỆ THỐNG",
    icon: "settings",
    children: [
      { label: "Cấu hình hệ thống", icon: "settings", workspaceRoot: "/admin" },
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
    children: group.children.map((child) => resolveChild(child, user)).filter((item): item is NavItem => item !== null),
  })).filter((group) => group.children.length > 0);
}
