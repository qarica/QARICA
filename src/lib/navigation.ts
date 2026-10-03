import type { NavGroup, NavItem, UserContext } from "@/lib/types";
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
// the organization-wide business modules above — explicit request: personal/
// utility destinations (Việc của tôi, Cá nhân, Cấu hình hệ thống) read as a
// distinct tier from the shared QLCL/EMR/procurement-style modules.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "operations",
    label: "ĐIỀU HÀNH CHẤT LƯỢNG",
    icon: "layout-dashboard",
    children: [
      { label: "Tổng quan QLCL", href: "/dashboard", icon: "layout-dashboard", permission: "dashboard.view" },
      { label: "Lịch QLCL", href: "/calendar", icon: "calendar-days", permission: "dashboard.view" },
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
    children: [
      { label: "BỆNH ÁN ĐIỆN TỬ", href: "/emr", icon: "network", permission: "emr.view" },
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
    label: "PHÁT HÀNH VĂN BẢN",
    icon: "file-text",
    children: [
      { label: "PHÁT HÀNH VĂN BẢN", href: "/document-publications", icon: "file-text", permission: "document_publication.view" },
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
    id: "my-work",
    label: "VIỆC CỦA TÔI",
    icon: "inbox",
    footer: true,
    children: [
      { label: "VIỆC CỦA TÔI", href: "/tasks", icon: "inbox", permission: "tasks.view" },
    ],
  },
  {
    id: "personal-workspace",
    label: "CÁ NHÂN",
    icon: "users",
    footer: true,
    children: [
      { label: "CÁ NHÂN", href: "/me", icon: "users" },
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
