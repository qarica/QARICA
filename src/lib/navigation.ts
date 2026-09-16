import type { NavSection, UserContext } from "@/lib/types";

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "TỔNG QUAN",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Việc của tôi", href: "/tasks", icon: "check-square", permission: "tasks.view" },
      { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
    ],
  },
  {
    label: "ĐIỀU HÀNH & ĐO LƯỜNG",
    items: [
      { label: "Kế hoạch chất lượng", href: "/plans", icon: "calendar-range", anyPermissions: ["plans.view", "plans.manage"] },
      { label: "Chỉ đạo / Yêu cầu", href: "/directives", icon: "file-input", anyPermissions: ["directives.view", "directives.manage"] },
      { label: "Nghĩa vụ báo cáo", href: "/reports", icon: "send", anyPermissions: ["reports.view", "reports.manage"] },
      { label: "Chỉ số chất lượng", href: "/indicators", icon: "chart-no-axes-column-increasing", anyPermissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"] },
      { label: "Giám sát & Bảng kiểm", href: "/monitoring", icon: "list-checks", anyPermissions: ["monitoring.view", "monitoring.perform", "checklists.manage"] },
    ],
  },
  {
    label: "ĐÁNH GIÁ & KIỂM TRA",
    items: [
      { label: "Tự đánh giá", href: "/assessments", icon: "badge-check", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Đánh giá ngoài", href: "/external-assessments", icon: "search-check", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Audit / Tracer", href: "/audits", icon: "search-check", anyPermissions: ["audit.view", "audit.perform", "audit.manage"] },
      { label: "Tiếp đoàn", href: "/inspections", icon: "clipboard-search", anyPermissions: ["inspections.view", "inspections.manage"] },
    ],
  },
  {
    label: "AN TOÀN & RỦI RO",
    items: [
      { label: "Sự cố y khoa", href: "/incidents", icon: "shield-alert", anyPermissions: ["incident.report", "incident.view_summary", "incident.view_case", "incident.triage"] },
      { label: "Phản ánh / Góp ý", href: "/feedback", icon: "message-circle-warning", anyPermissions: ["feedback.view", "feedback.manage"] },
      { label: "Bài học / Cảnh báo", href: "/safety-alerts", icon: "megaphone", anyPermissions: ["incident.view_summary", "incident.view_case"] },
      { label: "Risk Register", href: "/risks", icon: "triangle-alert", anyPermissions: ["risk.view", "risk.manage"] },
      { label: "FMEA / HFMEA", href: "/fmea", icon: "workflow", anyPermissions: ["risk.view", "risk.manage"] },
    ],
  },
  {
    label: "KHẮC PHỤC & CẢI TIẾN",
    items: [
      { label: "Findings", href: "/findings", icon: "circle-alert", anyPermissions: ["findings.view", "findings.manage"] },
      { label: "CAPA", href: "/capa", icon: "workflow", anyPermissions: ["capa.view", "capa.manage"] },
      { label: "Đề án cải tiến", href: "/improvement/projects", icon: "lightbulb", anyPermissions: ["projects.view", "projects.manage"] },
      { label: "Đề xuất cải tiến", href: "/improvement/proposals", icon: "file-input", anyPermissions: ["projects.view", "projects.propose", "projects.manage"] },
    ],
  },
  {
    label: "TÀI LIỆU & PHÂN TÍCH",
    items: [
      { label: "Kho minh chứng", href: "/evidence", icon: "folder-check", anyPermissions: ["evidence.upload", "evidence.review", "criteria.view"] },
      { label: "Phân tích QLCL", href: "/analytics", icon: "chart-spline", permission: "reports.analytics" },
    ],
  },
];

export function visibleNav(user: UserContext) {
  const permissionSet = new Set(user.permissions);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.permission && !permissionSet.has(item.permission)) return false;
      if (item.anyPermissions?.length && !item.anyPermissions.some((permission) => permissionSet.has(permission))) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}
