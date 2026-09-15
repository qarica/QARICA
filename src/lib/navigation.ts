import type { NavSection, UserContext } from "@/lib/types";
import { workspaceLandingHref } from "@/lib/workspace-navigation";

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "TỔNG QUAN",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Việc của tôi", href: "/tasks", icon: "check-square", permission: "tasks.view" },
      // "Trợ lý QLCL" đã bỏ khỏi sidebar theo yêu cầu — đã có nút riêng
      // ở thanh trên cùng (.assistant-topbar trong app-shell.tsx), giữ
      // nguyên route /assistant, chỉ ẩn khỏi menu bên trái để đỡ trùng lặp.
    ],
  },
  {
    label: "VẬN HÀNH CHẤT LƯỢNG",
    items: [
      { label: "Điều hành QLCL", href: "/plans", workspaceRoot: "/plans", icon: "calendar-range" },
      { label: "Đo lường chất lượng", href: "/indicators", workspaceRoot: "/indicators", icon: "chart-no-axes-column-increasing" },
      { label: "Đánh giá & Tiếp đoàn", href: "/assessments", workspaceRoot: "/assessments", icon: "badge-check" },
    ],
  },
  {
    label: "AN TOÀN & CẢI TIẾN",
    items: [
      { label: "Sự cố & Phản ánh", href: "/incidents", workspaceRoot: "/incidents", icon: "shield-alert" },
      { label: "Quản lý rủi ro", href: "/risks", workspaceRoot: "/risks", icon: "triangle-alert" },
      { label: "Khắc phục & CAPA", href: "/findings", workspaceRoot: "/findings", icon: "workflow" },
      { label: "Cải tiến chất lượng", href: "/improvement/projects", workspaceRoot: "/improvement/projects", icon: "lightbulb" },
    ],
  },
  {
    label: "TRI THỨC & PHÂN TÍCH",
    items: [
      { label: "Tài liệu & Minh chứng", href: "/evidence", workspaceRoot: "/evidence", icon: "folder-check" },
      { label: "Phân tích QLCL", href: "/analytics", icon: "chart-spline", permission: "reports.analytics" },
    ],
  },
];

export function visibleNav(user: UserContext) {
  const permissionSet = new Set(user.permissions);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.flatMap((item) => {
      if (item.workspaceRoot) {
        const landingHref = workspaceLandingHref(item.workspaceRoot, user);
        return landingHref ? [{ ...item, href: landingHref }] : [];
      }
      if (item.permission && !permissionSet.has(item.permission)) return [];
      if (item.anyPermissions?.length && !item.anyPermissions.some((permission) => permissionSet.has(permission))) return [];
      return [item];
    }),
  })).filter((section) => section.items.length > 0);
}
