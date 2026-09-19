import type { NavSection, UserContext } from "@/lib/types";
import { WORKSPACES, workspaceLandingHref } from "@/lib/workspace-navigation";

type WorkspaceNav = {
  label: string;
  root: string;
  icon: string;
};

const PRIMARY_WORKSPACES: WorkspaceNav[] = [
  { label: "Kế hoạch & Điều hành", root: "/plans", icon: "target" },
  { label: "Đo lường & Giám sát", root: "/indicators", icon: "gauge" },
  { label: "An toàn & Rủi ro", root: "/incidents", icon: "shield-alert" },
  { label: "Đánh giá & Kiểm tra", root: "/assessments", icon: "clipboard-check" },
  { label: "Khắc phục & Cải tiến", root: "/findings", icon: "refresh-cw" },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "CÔNG VIỆC",
    items: [
      { label: "Tổng quan", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Việc của tôi", href: "/tasks", icon: "inbox", permission: "tasks.view" },
    ],
  },
  {
    label: "KHÔNG GIAN QLCL",
    items: PRIMARY_WORKSPACES.map((item) => ({ label: item.label, href: item.root, icon: item.icon })),
  },
  {
    label: "PHÂN TÍCH",
    items: [
      { label: "Báo cáo & Phân tích", href: "/analytics", icon: "trending-up", permission: "reports.analytics" },
    ],
  },
];

export function visibleNav(user: UserContext) {
  const permissionSet = new Set(user.permissions);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .map((item) => {
        if (PRIMARY_WORKSPACES.some((workspace) => workspace.root === item.href)) {
          const landing = workspaceLandingHref(item.href, user);
          return landing ? { ...item, href: landing } : null;
        }
        return item;
      })
      .filter((item): item is NonNullable<typeof item> => {
        if (!item) return false;
        if (item.permission && !permissionSet.has(item.permission)) return false;
        if (item.anyPermissions?.length && !item.anyPermissions.some((permission) => permissionSet.has(permission))) return false;
        return true;
      }),
  })).filter((section) => section.items.length > 0);
}

// Keep workspace definitions as the single source of truth for module-level
// permissions and tabs. The sidebar intentionally exposes only the major
// workspaces; secondary modules remain available inside their workspace.
void WORKSPACES;
