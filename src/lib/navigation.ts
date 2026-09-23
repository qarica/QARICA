import type { NavSection, UserContext } from "@/lib/types";
import { WORKSPACES, workspaceLandingHref } from "@/lib/workspace-navigation";

type WorkspaceNav = { label: string; root: string; icon: string };

const PRIMARY_WORKSPACES: WorkspaceNav[] = [
  { label: "Kế hoạch & Điều hành", root: "/plans", icon: "target" },
  { label: "Đo lường & Giám sát", root: "/indicators", icon: "gauge" },
  { label: "Đánh giá & Kiểm tra", root: "/assessments", icon: "clipboard-check" },
  { label: "Sự cố & Phản ánh", root: "/incidents", icon: "shield-alert" },
  { label: "Rủi ro & FMEA", root: "/risks", icon: "triangle-alert" },
  { label: "Khắc phục & CAPA", root: "/findings", icon: "refresh-cw" },
  { label: "Cải tiến chất lượng", root: "/improvement/projects", icon: "lightbulb" },
  { label: "Kho minh chứng", root: "/evidence", icon: "folder-check" },
];

export const NAV_SECTIONS: NavSection[] = [
  { label: "CÔNG VIỆC", items: [
    { label: "Tổng quan", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
    { label: "Việc của tôi", href: "/tasks", icon: "inbox", permission: "tasks.view" },
    { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
  ]},
  { label: "NGHIỆP VỤ QLCL", items: PRIMARY_WORKSPACES.map((item) => ({ label: item.label, href: item.root, icon: item.icon })) },
  { label: "BÁO CÁO", items: [
    { label: "Báo cáo & Phân tích", href: "/analytics", icon: "trending-up", permission: "reports.analytics" },
  ]},
  { label: "HỆ THỐNG", items: [
    { label: "Cấu hình hệ thống", href: "/admin", icon: "settings", anyPermissions: ["users.manage", "departments.manage", "permissions.manage", "system.manage"] },
  ]},
];

export function visibleNav(user: UserContext) {
  const permissionSet = new Set(user.permissions);
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (PRIMARY_WORKSPACES.some((workspace) => workspace.root === item.href)) {
        const landing = workspaceLandingHref(item.href, user);
        return landing ? { ...item, href: landing, workspaceRoot: item.href } : null;
      }
      return item;
    }).filter((item): item is NonNullable<typeof item> => {
      if (!item) return false;
      if (item.permission && !permissionSet.has(item.permission)) return false;
      if (item.anyPermissions?.length && !item.anyPermissions.some((permission) => permissionSet.has(permission))) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

// Sidebar shows recognizable business areas. Workspace tabs remain the
// authoritative second level, so users can reach every module without
// restoring the old 20+ item flat menu.
void WORKSPACES;
