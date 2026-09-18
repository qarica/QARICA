import type { NavSection, UserContext } from "@/lib/types";

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "CÔNG VIỆC HÔM NAY",
    items: [
      { label: "Tổng quan", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Việc của tôi", href: "/tasks", icon: "inbox", permission: "tasks.view" },
      { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
    ],
  },
  {
    label: "ĐIỀU HÀNH CHẤT LƯỢNG",
    items: [
      { label: "Kế hoạch chất lượng", href: "/plans", icon: "target", anyPermissions: ["plans.view", "plans.manage"] },
      { label: "Nhóm công tác", href: "/work-groups", icon: "users-round", anyPermissions: ["plans.view", "plans.manage"] },
      { label: "Chỉ đạo / Yêu cầu", href: "/directives", icon: "megaphone", anyPermissions: ["directives.view", "directives.manage"] },
      { label: "Chỉ số chất lượng", href: "/indicators", icon: "gauge", anyPermissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"] },
      { label: "Giám sát & Bảng kiểm", href: "/monitoring", icon: "clipboard-check", anyPermissions: ["monitoring.view", "monitoring.perform", "checklists.manage"] },
      { label: "Nghĩa vụ báo cáo", href: "/reports", icon: "file-text", anyPermissions: ["reports.view", "reports.manage"] },
    ],
  },
  {
    label: "AN TOÀN & RỦI RO",
    items: [
      { label: "Sự cố y khoa", href: "/incidents", icon: "triangle-alert", anyPermissions: ["incident.report", "incident.view_summary", "incident.view_case", "incident.triage"] },
      { label: "Phản ánh / Góp ý", href: "/feedback", icon: "message-square-warning", anyPermissions: ["feedback.view", "feedback.manage"] },
      { label: "Bài học / Cảnh báo", href: "/safety-alerts", icon: "bell-ring", anyPermissions: ["incident.view_summary", "incident.view_case"] },
      { label: "Danh mục rủi ro", href: "/risks", icon: "book-open", anyPermissions: ["risk.view", "risk.manage"] },
      { label: "FMEA / HFMEA", href: "/fmea", icon: "workflow", anyPermissions: ["risk.view", "risk.manage"] },
    ],
  },
  {
    label: "ĐÁNH GIÁ & KIỂM TRA",
    items: [
      { label: "Tự đánh giá", href: "/assessments", icon: "network", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Đánh giá ngoài", href: "/external-assessments", icon: "search", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Audit / Tracer", href: "/audits", icon: "footprints", anyPermissions: ["audit.view", "audit.perform", "audit.manage"] },
      { label: "Tiếp đoàn", href: "/inspections", icon: "users-round", anyPermissions: ["inspections.view", "inspections.manage"] },
    ],
  },
  {
    label: "KHẮC PHỤC & CẢI TIẾN",
    items: [
      { label: "Phát hiện / Findings", href: "/findings", icon: "search-check", anyPermissions: ["findings.view", "findings.manage"] },
      { label: "CAPA", href: "/capa", icon: "refresh-cw", anyPermissions: ["capa.view", "capa.manage"] },
      { label: "Đề xuất cải tiến", href: "/improvement/proposals", icon: "sprout", anyPermissions: ["projects.view", "projects.propose", "projects.manage"] },
      { label: "Đề án cải tiến", href: "/improvement/projects", icon: "lightbulb", anyPermissions: ["projects.view", "projects.manage"] },
    ],
  },
  {
    label: "MINH CHỨNG & PHÂN TÍCH",
    items: [
      { label: "Kho minh chứng", href: "/evidence", icon: "folder-archive", anyPermissions: ["evidence.upload", "evidence.review", "criteria.view"] },
      { label: "Báo cáo & Phân tích", href: "/analytics", icon: "trending-up", permission: "reports.analytics" },
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
