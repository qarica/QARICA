import type { UserContext } from "@/lib/types";

type PermissionGate = {
  permission?: string;
  anyPermissions?: string[];
};

export type WorkspaceTab = PermissionGate & {
  label: string;
  href: string;
  icon: string;
};

export type WorkspaceDefinition = {
  root: string;
  title: string;
  eyebrow: string;
  tabs: WorkspaceTab[];
};

export const WORKSPACES: WorkspaceDefinition[] = [
  {
    root: "/plans",
    title: "Điều hành QLCL",
    eyebrow: "Kế hoạch · điều phối · nghĩa vụ",
    tabs: [
      { label: "Kế hoạch", href: "/plans", icon: "calendar-range", anyPermissions: ["plans.view", "plans.manage"] },
      { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
      { label: "Chỉ đạo / Yêu cầu", href: "/directives", icon: "file-input", anyPermissions: ["directives.view", "directives.manage"] },
      { label: "Nghĩa vụ báo cáo", href: "/reports", icon: "send", anyPermissions: ["reports.view", "reports.manage"] },
    ],
  },
  {
    root: "/indicators",
    title: "Đo lường chất lượng",
    eyebrow: "Chỉ số · giám sát · bảng kiểm",
    tabs: [
      { label: "Chỉ số chất lượng", href: "/indicators", icon: "chart-no-axes-column-increasing", anyPermissions: ["indicators.view", "indicators.manage", "indicators.enter", "indicators.verify"] },
      { label: "Giám sát & Bảng kiểm", href: "/monitoring", icon: "list-checks", anyPermissions: ["monitoring.view", "monitoring.perform", "checklists.manage"] },
    ],
  },
  {
    root: "/assessments",
    title: "Đánh giá & Tiếp đoàn",
    eyebrow: "Tự đánh giá · đánh giá ngoài · tracer · tiếp đoàn",
    tabs: [
      { label: "Tự đánh giá", href: "/assessments", icon: "badge-check", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Đánh giá ngoài", href: "/external-assessments", icon: "search-check", anyPermissions: ["criteria.view", "criteria.assess", "criteria.review", "criteria.manage"] },
      { label: "Audit / Tracer", href: "/audits", icon: "search-check", anyPermissions: ["audit.view", "audit.perform", "audit.manage"] },
      { label: "Tiếp đoàn", href: "/inspections", icon: "clipboard-search", anyPermissions: ["inspections.view", "inspections.manage"] },
    ],
  },
  {
    root: "/incidents",
    title: "Sự cố & Phản ánh",
    eyebrow: "Phát hiện · phản hồi · bài học an toàn",
    tabs: [
      { label: "Sự cố y khoa", href: "/incidents", icon: "shield-alert", anyPermissions: ["incident.report", "incident.view_summary", "incident.view_case", "incident.triage"] },
      { label: "Phản ánh / Góp ý", href: "/feedback", icon: "message-circle-warning", anyPermissions: ["feedback.view", "feedback.manage"] },
      { label: "Bài học / Cảnh báo", href: "/safety-alerts", icon: "megaphone", anyPermissions: ["incident.view_summary", "incident.view_case"] },
    ],
  },
  {
    root: "/risks",
    title: "Quản lý rủi ro",
    eyebrow: "Risk register · FMEA / HFMEA",
    tabs: [
      { label: "Risk Register", href: "/risks", icon: "triangle-alert", anyPermissions: ["risk.view", "risk.manage"] },
      { label: "FMEA / HFMEA", href: "/fmea", icon: "workflow", anyPermissions: ["risk.view", "risk.manage"] },
    ],
  },
  {
    root: "/findings",
    title: "Khắc phục & CAPA",
    eyebrow: "Finding · hành động · hiệu lực",
    tabs: [
      { label: "Findings", href: "/findings", icon: "circle-alert", anyPermissions: ["findings.view", "findings.manage"] },
      { label: "CAPA", href: "/capa", icon: "workflow", anyPermissions: ["capa.view", "capa.manage"] },
    ],
  },
  {
    root: "/improvement/projects",
    title: "Cải tiến chất lượng",
    eyebrow: "Đề xuất · đề án · PDSA",
    tabs: [
      { label: "Đề án cải tiến", href: "/improvement/projects", icon: "lightbulb", anyPermissions: ["projects.view", "projects.manage"] },
      { label: "Đề xuất cải tiến", href: "/improvement/proposals", icon: "file-input", anyPermissions: ["projects.view", "projects.propose", "projects.manage"] },
    ],
  },
  {
    root: "/evidence",
    title: "Tài liệu & Minh chứng",
    eyebrow: "Căn cứ · kiểm soát · bằng chứng",
    tabs: [
      { label: "Kho minh chứng", href: "/evidence", icon: "folder-check", anyPermissions: ["evidence.upload", "evidence.review", "criteria.view"] },
    ],
  },
  {
    root: "/admin",
    title: "Quản trị hệ thống",
    eyebrow: "Người dùng · quyền · danh mục · cấu hình",
    tabs: [
      { label: "Người dùng", href: "/admin/users", icon: "users", permission: "users.manage" },
      { label: "Nhóm phân công", href: "/admin/user-groups", icon: "users-round", permission: "users.manage" },
      { label: "Khoa / Phòng", href: "/admin/departments", icon: "building-2", permission: "departments.manage" },
      { label: "Phân quyền", href: "/admin/permissions", icon: "key-round", permission: "permissions.manage" },
      { label: "Danh mục", href: "/admin/catalogs", icon: "list-tree", permission: "system.manage" },
      { label: "Cấu hình", href: "/admin/settings", icon: "settings", permission: "system.manage" },
    ],
  },
];

function canAccess(gate: PermissionGate, user: UserContext) {
  const permissions = new Set(user.permissions);
  if (gate.permission) return permissions.has(gate.permission);
  if (gate.anyPermissions?.length) return gate.anyPermissions.some((permission) => permissions.has(permission));
  return true;
}

function normalizePath(pathname: string) {
  return (pathname.split("?")[0] || "/").replace(/\/$/, "") || "/";
}

function matchesPath(pathname: string, href: string) {
  const path = normalizePath(pathname);
  const target = normalizePath(href);
  return path === target || path.startsWith(`${target}/`);
}

export function workspaceForPath(pathname: string) {
  const candidates = WORKSPACES.flatMap((workspace) => workspace.tabs.map((tab) => ({ workspace, tab })));
  return candidates
    .filter(({ tab }) => matchesPath(pathname, tab.href))
    .sort((a, b) => normalizePath(b.tab.href).length - normalizePath(a.tab.href).length)[0]?.workspace ?? null;
}

export function workspaceRootForPath(pathname: string) {
  return workspaceForPath(pathname)?.root ?? null;
}

export function visibleWorkspaceForPath(pathname: string, user: UserContext) {
  const workspace = workspaceForPath(pathname);
  if (!workspace) return null;
  const tabs = workspace.tabs.filter((tab) => canAccess(tab, user));
  if (!tabs.length) return null;
  return { ...workspace, tabs };
}

export function workspaceLandingHref(root: string, user: UserContext) {
  const workspace = WORKSPACES.find((item) => item.root === root);
  if (!workspace) return null;
  return workspace.tabs.find((tab) => canAccess(tab, user))?.href ?? null;
}

export function isWorkspaceTabActive(pathname: string, href: string) {
  return matchesPath(pathname, href);
}

export function adminLandingHref(user: UserContext) {
  return workspaceLandingHref("/admin", user);
}
