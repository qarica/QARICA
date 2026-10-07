"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NavGroup, NavItem, OrganizationInfo, UserContext } from "@/lib/types";
import { adminLandingHref, isWorkspaceTabActive, visibleWorkspaceForPath, workspaceRootForPath } from "@/lib/workspace-navigation";
import { Icon } from "@/components/icon";
import { YearSelector } from "@/components/year-selector";
import { NotificationBell } from "@/components/notification-bell";

type AttentionState = Record<string, { count: number; urgent: boolean }>;

type AttentionNotification = {
  id: string;
  priority: string | null;
  target_record_id: string | null;
  target_route: string | null;
};

const NAV_ICON_TONE: Record<string, string> = {
  "/dashboard": "overview", "/tasks": "work", "/calendar": "calendar", "/emr": "measure",
  "/plans": "plan", "/indicators": "measure", "/assessments": "assessment",
  "/incidents": "incident", "/risks": "risk", "/findings": "capa",
  "/improvement/projects": "improvement", "/evidence": "evidence",
  "/analytics": "analytics", "/admin": "system",
};

const RECORD_TYPE_NAV: Record<string, string> = {
  ACTION: "/tasks", PROGRAM: "/plans", DIRECTIVE: "/directives", REPORT: "/reports", INSPECTION: "/inspections", INDICATOR_MEASUREMENT: "/indicators", MONITORING: "/monitoring", FINDING: "/findings", INCIDENT: "/incidents", CAPA: "/capa", RISK: "/risks", IMPROVEMENT_PROJECT: "/improvement/projects", IMPROVEMENT_PROPOSAL: "/improvement/proposals", ASSESSMENT: "/assessments", EXTERNAL_ASSESSMENT: "/external-assessments", AUDIT: "/audits", SAFETY_ALERT: "/safety-alerts", FEEDBACK: "/feedback",
};

function normalizeNavRoute(route: string | null, navGroups: NavGroup[]) {
  if (!route) return null;
  const base = route.split("?")[0];
  const visibleRoots = new Set(navGroups.flatMap((group) => group.children.map((item) => item.workspaceRoot || item.href.split("?")[0])));
  const workspaceRoot = workspaceRootForPath(base);
  if (workspaceRoot && visibleRoots.has(workspaceRoot)) return workspaceRoot;
  const hrefs = navGroups.flatMap((group) => group.children.map((item) => item.href.split("?")[0]));
  return [...hrefs].sort((a, b) => b.length - a.length).find((href) => base === href || base.startsWith(`${href}/`)) ?? null;
}

// Single source of truth for "is this child the active route" — shared by the
// per-link active class and by the accordion group's auto-expand resolution,
// so the two never drift apart.
function isChildActive(pathname: string, child: NavItem, currentWorkspaceRoot: string | null) {
  if (child.workspaceRoot) return currentWorkspaceRoot === child.workspaceRoot;
  const baseHref = child.href.split("?")[0];
  return pathname === baseHref || (baseHref !== "/dashboard" && pathname.startsWith(`${baseHref}/`));
}

function resolveActiveGroupId(pathname: string, navGroups: NavGroup[], currentWorkspaceRoot: string | null) {
  return navGroups.find((group) => group.children.some((child) => isChildActive(pathname, child, currentWorkspaceRoot)))?.id ?? null;
}

export function AppShell({ children, user, organization, navGroups, year }: { children: React.ReactNode; user: UserContext; organization: OrganizationInfo | null; navGroups: NavGroup[]; year: number; }) {
  const pathname = usePathname(); const router = useRouter(); const supabase = useMemo(() => createClient(), []);
  const [mobileOpen, setMobileOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [navigating, setNavigating] = useState(false); const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [attention, setAttention] = useState<AttentionState>({});
  const workspace = visibleWorkspaceForPath(pathname, user); const currentWorkspaceRoot = workspaceRootForPath(pathname); const adminHref = adminLandingHref(user);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(() => resolveActiveGroupId(pathname, navGroups, currentWorkspaceRoot));

  useEffect(() => { setNavigating(false); setProfileOpen(false); setMobileOpen(false); }, [pathname]);
  useEffect(() => { try { setSidebarCollapsed(window.localStorage.getItem("qlcl-sidebar-collapsed") === "1"); } catch {} }, []);
  // Re-sync on every navigation (not merely when the resolved id differs from
  // its last value) so the active group always re-expands even if the user
  // had manually switched to peek at another group in between.
  useEffect(() => { setExpandedGroupId(resolveActiveGroupId(pathname, navGroups, workspaceRootForPath(pathname))); }, [pathname, navGroups]);
  function toggleGroup(id: string) { setExpandedGroupId((current) => (current === id ? null : id)); }

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  useEffect(() => {
    let active = true;
    async function loadAttention() {
      const next = new Map<string, { ids: Set<string>; urgent: boolean }>();
      const add = (href: string | null, id: string, urgent: boolean) => { if (!href) return; const base = href.split("?")[0]; const target = base === "/assistant" ? base : (workspaceRootForPath(base) || base); const current = next.get(target) ?? { ids: new Set<string>(), urgent: false }; current.ids.add(id); current.urgent = current.urgent || urgent; next.set(target, current); };
      const addActionable = (href: string | null, id: string, urgent: boolean) => { add(href, id, urgent); };
      try {
        const canVerifyTasks = user.permissions.includes("plans.manage"); const canConfirmMonitoring = user.permissions.includes("checklists.manage"); const canManageDirectives = user.permissions.includes("directives.manage"); const canManageReports = user.permissions.includes("reports.manage"); const canManageRisks = user.permissions.includes("risk.manage"); const canVerifyIndicators = user.permissions.includes("indicators.verify") || user.permissions.includes("indicators.manage"); const canManageCapa = user.permissions.includes("capa.manage"); const canManageFeedback = user.permissions.includes("feedback.manage"); const canManageInspections = user.permissions.includes("inspections.manage") || user.permissions.includes("plans.manage"); const canManageFindings = user.permissions.includes("findings.manage");
        const [groupAssignmentsRes, departmentRolesRes] = await Promise.all([
          supabase.from("work_group_assignment_snapshots").select("target_record_id,member_snapshot").eq("assignment_role", "ACTION_ASSIGNEE_GROUP"),
          user.primaryDepartmentId ? supabase.from("department_user_roles").select("role_type").eq("department_id", user.primaryDepartmentId).eq("user_id", user.id).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"]) : Promise.resolve({ data: [], error: null }),
        ]);
        if (groupAssignmentsRes.error) throw new Error(`Truy vấn group assignment lỗi: ${groupAssignmentsRes.error.message}`);
        if (departmentRolesRes.error) throw new Error(`Truy vấn department role lỗi: ${departmentRolesRes.error.message}`);
        const myGroupActionRecordIds = new Set<string>((groupAssignmentsRes.data ?? []).filter((row: any) => Array.isArray(row.member_snapshot) && row.member_snapshot.some((member: any) => String(member?.user_id || "").trim() === user.id)).map((row: any) => row.target_record_id).filter(Boolean));
        const canOperateDepartment = !!user.primaryDepartmentId && (departmentRolesRes.data ?? []).length > 0;
        const departmentExecutionsRes = canOperateDepartment ? await supabase.from("action_department_executions").select("action_id").eq("department_id", user.primaryDepartmentId) : { data: [], error: null };
        if (departmentExecutionsRes.error) throw new Error(`Truy vấn department execution lỗi: ${departmentExecutionsRes.error.message}`);
        const myDepartmentActionIds = new Set<string>((departmentExecutionsRes.data ?? []).map((row: any) => row.action_id).filter(Boolean));
        const [recordsRes, noticesRes, tasksRes, monitoringRes, directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes] = await Promise.all([
          supabase.from("records").select("id").eq("work_year", year).eq("lifecycle_status", "ACTIVE"), supabase.from("notifications").select("id,priority,target_record_id,target_route").eq("is_read", false).order("created_at", { ascending: false }).limit(100), supabase.from("vw_actions_dashboard").select("action_id,record_id,workflow_status,is_overdue,days_to_due,assignee_user_id,assignment_target_type,assignee_group_id").eq("work_year", year), supabase.from("monitoring_rounds").select("id,record_id,workflow_status,scheduled_date,lead_assessor_id").in("workflow_status", ["SCHEDULED", "IN_PROGRESS", "AWAITING_CONFIRMATION"]), supabase.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,lead_department_id,owner_user_id"), supabase.from("reporting_obligations").select("id,record_id,workflow_status,due_date,preparing_department_id,preparer_user_id"), supabase.from("risks").select("id,record_id,workflow_status,next_review_date,owner_user_id"), supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end"), supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date"), supabase.from("feedback_records").select("id,record_id,workflow_status,response_due_at"), supabase.from("inspection_events").select("id,record_id,workflow_status,visit_date"), supabase.from("findings").select("id,record_id,workflow_status,due_date,owner_user_id")]);
        const results = { recordsRes, noticesRes, tasksRes, monitoringRes, directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes } as Record<string, { error?: { message: string } | null }>;
        const failedQuery = Object.entries(results).find(([, r]) => r?.error);
        if (failedQuery) throw new Error(`Truy vấn "${failedQuery[0]}" lỗi: ${failedQuery[1]?.error?.message}`);
        const currentRecordIds = new Set((recordsRes.data ?? []).map((x: any) => x.id)); const inCurrentYear = (recordId: string | null | undefined) => !!recordId && currentRecordIds.has(recordId); const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); const todayMs = Date.parse(`${today}T00:00:00+07:00`); const daysTo = (value: string | null | undefined) => { if (!value) return null; const date = String(value).slice(0, 10); const targetMs = Date.parse(`${date}T00:00:00+07:00`); if (!Number.isFinite(targetMs) || !Number.isFinite(todayMs)) return null; return Math.round((targetMs - todayMs) / 86400000); }; const mine = (ownerUserId?: string | null, departmentId?: string | null) => ownerUserId === user.id || (!!user.primaryDepartmentId && departmentId === user.primaryDepartmentId);
        const notificationRows = (noticesRes.data ?? []) as AttentionNotification[]; const recordIds = Array.from(new Set(notificationRows.map((notice) => notice.target_record_id).filter(Boolean))) as string[]; const recordTypeById = new Map<string, string>(); if (recordIds.length) { const { data: records } = await supabase.from("records").select("id,record_type").in("id", recordIds); (records ?? []).forEach((record: any) => recordTypeById.set(record.id, record.record_type)); }
        for (const notice of notificationRows) { const priority = String(notice.priority || "").toUpperCase(); if (!["HIGH", "URGENT", "CRITICAL"].includes(priority)) continue; let href = normalizeNavRoute(notice.target_route, navGroups); if (!href && notice.target_record_id) href = RECORD_TYPE_NAV[recordTypeById.get(notice.target_record_id) || ""] || null; addActionable(href, `notice:${notice.id}`, true); }
        for (const task of (tasksRes.data ?? []) as any[]) { if (["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(String(task.workflow_status))) continue; const assignedToMe = task.assignee_user_id === user.id || (task.assignment_target_type === "GROUP" && myGroupActionRecordIds.has(task.record_id)) || (task.assignment_target_type === "DEPARTMENT" && myDepartmentActionIds.has(task.action_id)); const days = Number(task.days_to_due); const dueToday = Number.isFinite(days) && days === 0; const returned = task.workflow_status === "RETURNED"; const overdue = Boolean(task.is_overdue); const needsVerification = canVerifyTasks && ["EVIDENCE_SUBMITTED", "VERIFYING"].includes(task.workflow_status); if ((assignedToMe && (overdue || dueToday || returned)) || needsVerification) addActionable("/tasks", `task:${task.action_id}`, overdue || returned); }
        for (const round of (monitoringRes.data ?? []) as any[]) { if (!inCurrentYear(round.record_id)) continue; if (round.workflow_status === "AWAITING_CONFIRMATION" && canConfirmMonitoring) { addActionable("/monitoring", `monitoring:${round.id}`, false); continue; } if (round.lead_assessor_id !== user.id) continue; if (round.workflow_status === "IN_PROGRESS") { addActionable("/monitoring", `monitoring:${round.id}`, true); continue; } if (round.workflow_status === "SCHEDULED" && round.scheduled_date && round.scheduled_date <= today) addActionable("/monitoring", `monitoring:${round.id}`, round.scheduled_date < today); }
        for (const directive of (directivesRes.data ?? []) as any[]) { if (!inCurrentYear(directive.record_id) || ["COMPLETED", "CANCELLED"].includes(String(directive.workflow_status))) continue; if (!canManageDirectives && !mine(directive.owner_user_id, directive.lead_department_id)) continue; const days = daysTo(directive.report_due_date || directive.implementation_due_date); if (days !== null && days <= 7) addActionable("/directives", `directive:${directive.id}`, days < 0); }
        for (const report of (reportsRes.data ?? []) as any[]) { if (!inCurrentYear(report.record_id) || ["COMPLETED", "CANCELLED"].includes(String(report.workflow_status))) continue; if (!canManageReports && !mine(report.preparer_user_id, report.preparing_department_id)) continue; const days = daysTo(report.due_date); if (days !== null && days <= 7) addActionable("/reports", `report:${report.id}`, days < 0); }
        for (const risk of (risksRes.data ?? []) as any[]) { if (!inCurrentYear(risk.record_id) || risk.workflow_status === "RETIRED") continue; if (!canManageRisks && risk.owner_user_id !== user.id) continue; const days = daysTo(risk.next_review_date); if (days !== null && days <= 7) addActionable("/risks", `risk:${risk.id}`, days < 0); }
        for (const indicator of (indicatorsRes.data ?? []) as any[]) { if (!inCurrentYear(indicator.record_id)) continue; if (indicator.workflow_status === "SUBMITTED" && canVerifyIndicators) addActionable("/indicators", `indicator-verify:${indicator.id}`, false); if (indicator.result_level === "OUT_OF_TARGET") addActionable("/indicators", `indicator-out:${indicator.id}`, false); }
        for (const capa of (capasRes.data ?? []) as any[]) { if (!inCurrentYear(capa.record_id) || ["CLOSED", "CANCELLED"].includes(String(capa.workflow_status)) || !canManageCapa) continue; const days = daysTo(capa.effectiveness_due_date); if (capa.workflow_status === "EFFECTIVENESS_REVIEW" || (days !== null && days <= 7)) addActionable("/capa", `capa:${capa.id}`, days !== null && days < 0); }
        for (const feedback of (feedbackRes.data ?? []) as any[]) { if (!inCurrentYear(feedback.record_id) || ["CLOSED", "CANCELLED"].includes(String(feedback.workflow_status)) || !canManageFeedback) continue; const days = daysTo(feedback.response_due_at); if (days !== null && days <= 3) addActionable("/feedback", `feedback:${feedback.id}`, days < 0); }
        for (const inspection of (inspectionsRes.data ?? []) as any[]) { if (!inCurrentYear(inspection.record_id) || ["COMPLETED", "CANCELLED"].includes(String(inspection.workflow_status)) || !canManageInspections) continue; const days = daysTo(inspection.visit_date); if (days !== null && days <= 14) addActionable("/inspections", `inspection:${inspection.id}`, days < 0 || days <= 2); }
        for (const finding of (findingsRes.data ?? []) as any[]) { if (!inCurrentYear(finding.record_id) || ["CLOSED", "CANCELLED"].includes(String(finding.workflow_status))) continue; if (!canManageFindings && finding.owner_user_id !== user.id) continue; const days = daysTo(finding.due_date); if (days !== null && days <= 7) addActionable("/findings", `finding:${finding.id}`, days < 0); }
        if (active) { const state: AttentionState = {}; next.forEach((value, href) => { state[href] = { count: value.ids.size, urgent: value.urgent }; }); setAttention(state); }
      } catch (err) { console.error("[AppShell] failed to load sidebar attention counts", err); }
    }
    loadAttention(); const timer = window.setInterval(loadAttention, 30000); const onFocus = () => loadAttention(); window.addEventListener("focus", onFocus); return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [navGroups, supabase, user.id, user.permissions, user.primaryDepartmentId, year]);

  function toggleSidebarCollapsed() { setSidebarCollapsed((current) => { const next = !current; try { window.localStorage.setItem("qlcl-sidebar-collapsed", next ? "1" : "0"); } catch {} return next; }); }
  async function logout() { await supabase.auth.signOut(); router.replace("/login"); router.refresh(); }
  const initials = (user.fullName || user.email || "QL").split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
  const displayName = user.fullName || (user.email ? user.email.split("@")[0] : "Người dùng");
  function startNavigation(href: string) { const target = href.split("?")[0]; if (target !== pathname) setNavigating(true); setMobileOpen(false); }
  function renderBadge(badge: { count: number; urgent: boolean } | undefined, className = "nav-attention-badge") { if (!badge?.count) return null; return <span className={`${className} ${badge.urgent ? "urgent" : "warning"}`}>{badge.count > 99 ? "99+" : badge.count}</span>; }
  function renderChild(item: NavItem, asGroupLink?: boolean) { const baseHref = item.href.split("?")[0]; const itemRoot = item.workspaceRoot || baseHref; const active = isChildActive(pathname, item, currentWorkspaceRoot); const badge = attention[itemRoot]; return <Link key={`${itemRoot}:${item.label}`} href={item.href} prefetch={true} className={asGroupLink ? `nav-link nav-group-link ${active ? "active" : ""}` : `nav-link nav-child-link ${active ? "active" : ""}`} title={`${item.label}${badge?.count ? ` · ${badge.count} việc cần chú ý` : ""}`} onMouseEnter={() => router.prefetch(item.href)} onFocus={() => router.prefetch(item.href)} onClick={() => startNavigation(item.href)}><span className={`nav-icon ${asGroupLink ? "nav-group-icon" : ""} ${NAV_ICON_TONE[itemRoot] || "overview"}`} aria-hidden="true"><Icon name={item.icon} size={18} /></span><span className="nav-link-label">{item.label}</span>{renderBadge(badge)}</Link>; }
  // A group with exactly one authorized child (EMR; Cấu hình hệ thống) has
  // nothing to expand — showing it as a collapsible accordion with a chevron
  // promises children that never appear. Promote it to a plain top-level link
  // instead, styled like a Level-1 item, so there is never an "expand reveals
  // only 1 item" moment.
  function renderGroup(group: NavGroup) {
    const expanded = expandedGroupId === group.id;
    const isActiveGroup = group.children.some((child) => isChildActive(pathname, child, currentWorkspaceRoot));
    if (group.children.length === 1) return renderChild(group.children[0], true);
    return <div className={`nav-group ${expanded ? "expanded" : ""} ${isActiveGroup ? "active-context" : ""}`} key={group.id}><button type="button" className="nav-group-header" aria-expanded={expanded} onClick={() => toggleGroup(group.id)}><span className="nav-icon nav-group-icon" aria-hidden="true"><Icon name={group.icon} size={18} /></span><span className="nav-group-label">{group.label}</span><Icon name="chevron-down" size={15} className={`nav-group-chevron ${expanded ? "expanded" : ""}`} /></button><div className="nav-group-children" aria-hidden={!expanded}>{expanded ? group.children.map((c) => renderChild(c)) : null}</div><div className="nav-group-flyout"><div className="nav-group-flyout-title">{group.label}</div>{group.children.map((c) => renderChild(c))}</div></div>;
  }
  const mainNavGroups = navGroups.filter((group) => !group.footer);
  const footerNavGroups = navGroups.filter((group) => group.footer);

  // Default must match globals.css's --brand (#0D6EFD): that stylesheet value
  // is now the only non-important declaration left after removing the 3
  // competing !important overrides (workspace-shell.css, qarica-design-
  // system.css, qms-enterprise-redesign.css) that used to silently beat this
  // inline style regardless of organization.primary_color — the per-org
  // custom brand color never actually took effect before. Keeping this
  // default in sync with globals.css means organizations that haven't set a
  // custom color see the exact same blue as before.
  return <div className="app-root workspace-app" style={{ ["--brand" as string]: organization?.primary_color || "#0D6EFD" }}>
    <style>{`
      .workspace-app{--sidebar-width:266px;--sidebar-collapsed-width:76px;background:#f5f8fc;color:#0f172a}
      .workspace-app .main-shell{margin-left:var(--sidebar-width);padding-top:68px;transition:margin-left .2s}
      .workspace-app .main-shell.sidebar-collapsed{margin-left:var(--sidebar-collapsed-width)}
      .workspace-app .sidebar{width:var(--sidebar-width);transition:width .2s,transform .2s}
      .workspace-app .sidebar.collapsed{width:var(--sidebar-collapsed-width)}
      .workspace-app .sidebar.collapsed .sidebar-brand-copy,.workspace-app .sidebar.collapsed .nav-label,.workspace-app .sidebar.collapsed .nav-link-label,.workspace-app .sidebar.collapsed .nav-group-label,.workspace-app .sidebar.collapsed .sidebar-bottom{display:none}
      .workspace-app .sidebar.collapsed .sidebar-brand{padding:14px 8px;justify-content:center}
      .workspace-app .sidebar.collapsed .brand-mark{width:38px;height:38px}
      .workspace-app .sidebar.collapsed .brand-mark img{width:38px;height:38px}
      .workspace-app .sidebar.collapsed .sidebar-collapse{position:absolute;right:-14px;top:56px;background:#fff;border:1px solid #dbe4f0;color:#2563eb;box-shadow:0 3px 10px rgba(37,99,235,.16)}
      .workspace-app .sidebar.collapsed .nav-link{margin:3px 8px;padding:10px;justify-content:center}
      .workspace-app .sidebar.collapsed .nav-group-header{justify-content:center;margin:3px 8px;padding:10px}
      .workspace-app .sidebar.collapsed .nav-group-chevron{display:none}
      .workspace-app .sidebar.collapsed .nav-group-children{display:none!important}
      .workspace-app .sidebar.collapsed .nav-group{position:relative}
      .workspace-app .sidebar.collapsed .nav-group-flyout{display:none;position:absolute;left:calc(100% + 8px);top:0;min-width:236px;max-height:calc(100vh - 24px);overflow-y:auto;background:#fff;border:1px solid #e5eaf2;border-radius:12px;box-shadow:0 18px 40px rgba(15,23,42,.16);padding:8px;z-index:70}
      .workspace-app .sidebar.collapsed .nav-group:hover .nav-group-flyout,.workspace-app .sidebar.collapsed .nav-group:focus-within .nav-group-flyout{display:block}
      .workspace-app .sidebar.collapsed .nav-group-flyout .nav-child-link{margin:2px 0}
      .workspace-app .sidebar.collapsed .nav-group-flyout .nav-link-label{display:inline}
      .workspace-app .sidebar:not(.collapsed) .sidebar-collapse{margin-left:auto;color:#64748b;background:#fff;border:1px solid #e5eaf2}
      .workspace-app .qarica-topbar{background:#ffffff!important;background-image:none!important;backdrop-filter:none;border-bottom:1px solid #e5eaf2;min-height:68px;padding:10px 22px;box-shadow:0 1px 2px rgba(15,23,42,.03);color:#0f172a}
      .workspace-app .topbar:before{content:none}
      .workspace-app .topbar{position:fixed;left:var(--sidebar-width,266px);right:0;width:auto;max-width:none;display:flex;align-items:center;gap:16px}
      .workspace-app .main-shell.sidebar-collapsed .topbar{left:var(--sidebar-collapsed-width,76px)}
      .workspace-app .topbar-left,.workspace-app .topbar-right{position:relative;z-index:1}
      .workspace-app .topbar-left{display:flex;align-items:center;gap:16px;min-width:0;flex:1 1 auto}
      .workspace-app .qarica-header-brand{display:flex;align-items:center;gap:12px;min-width:0}
      .workspace-app .qarica-header-mark{display:none}
      .workspace-app .qarica-header-name{display:none}
      .workspace-app .qarica-header-divider{display:none}
      .workspace-app .org-title strong{color:#0f172a;font-size:14px;letter-spacing:-.01em}
      .workspace-app .org-title span{color:#64748b;font-size:10px;letter-spacing:.04em}
      .workspace-app .mobile-brand-name{display:none}
      .workspace-app .qarica-desktop-tagline{display:none}
      .workspace-app .org-pill{display:inline-flex;align-items:center;gap:8px;background:#eff6ff;color:#1d4ed8;border:1px solid #dbeafe;border-radius:999px;padding:7px 14px 7px 10px;font-size:12.5px;font-weight:700;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
      .workspace-app .top-search{position:relative;display:flex;align-items:center;gap:8px;background:#f1f5f9;border:1px solid #e5eaf2;border-radius:10px;padding:0 12px;height:38px;flex:1 1 auto;min-width:0;max-width:420px;color:#94a3b8}
      .workspace-app .top-search input{border:0;background:transparent;outline:none;font-size:13px;color:#0f172a;flex:1;min-width:0}
      .workspace-app .top-search input::placeholder{color:#94a3b8}
      .workspace-app .top-search-kbd{font-size:10px;font-weight:700;color:#94a3b8;border:1px solid #e2e8f0;border-radius:6px;padding:2px 6px;background:#fff;flex:0 0 auto}
      .workspace-app .top-search-panel{position:absolute;top:calc(100% + 8px);left:0;right:0;background:#fff;border:1px solid #e5eaf2;border-radius:12px;box-shadow:0 18px 40px rgba(15,23,42,.14);overflow:hidden;z-index:60;max-height:360px;overflow-y:auto}
      .workspace-app .top-search-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:10px 14px;border:0;border-bottom:1px solid #f1f5f9;background:#fff;cursor:pointer}
      .workspace-app .top-search-item:hover{background:#f8fafc}
      .workspace-app .top-search-item-label{font-size:10px;font-weight:800;color:#2563eb;text-transform:uppercase}
      .workspace-app .top-search-item strong{font-size:12.5px;color:#0f172a;font-weight:600}
      .workspace-app .top-search-empty{padding:14px;font-size:12.5px;color:#94a3b8;text-align:center}
      .workspace-app .assistant-topbar{border:1px solid #dbe4f0;background:#f8fafc;color:#2563eb;border-radius:14px;padding:9px 13px;gap:8px;transition:.2s;box-shadow:none}
      .workspace-app .assistant-topbar:hover,.workspace-app .assistant-topbar.active{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8;transform:translateY(-1px)}
      .workspace-app .assistant-attention-badge{display:none}
      .workspace-app .header-icon,.workspace-app .icon-button{border-radius:12px}
      .workspace-app .header-icon{color:#475569;background:#fff;border:1px solid #e5eaf2}
      .workspace-app .header-icon:hover{color:#2563eb;background:#f8fafc;border-color:#dbe4f0}
      .workspace-app .profile-button{border:1px solid #e5eaf2;background:#fff;border-radius:14px;padding:5px 8px 5px 6px;gap:8px}
      .workspace-app .profile-button:hover{background:#f8fafc;border-color:#dbe4f0}
      .workspace-app .avatar{background:#2563eb;box-shadow:0 4px 10px rgba(37,99,235,.18)}
      .workspace-app .sidebar{background:#ffffff;border-right:1px solid #e5eaf2;color:#0f172a}
      .workspace-app .sidebar:before{content:none}
      .workspace-app .sidebar-brand{background:#ffffff;border-bottom:1px solid #e5eaf2}
      .workspace-app .brand-mark{width:40px;height:40px;border-radius:12px;background:transparent;box-shadow:none}
      .workspace-app .brand-mark img{width:40px;height:40px;display:block}
      .workspace-app .sidebar-brand-copy strong{color:#0f172a;font-size:16px;font-weight:900}
      .workspace-app .sidebar-brand-copy span{color:#64748b;font-size:10px}
      .workspace-app .nav-label{color:#94a3b8;font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:14px 18px 6px}
      .workspace-app .nav-link{position:relative;border-radius:10px;margin:2px 10px;padding:9px 12px;color:#475569;border:1px solid transparent;box-shadow:none;font-weight:600;font-size:13px}
      .workspace-app .nav-link:hover{background:#f8fafc;border-color:#eef2f7;color:#0f172a}
      .workspace-app .nav-link.active{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8;font-weight:800;box-shadow:none}
      .workspace-app .nav-link.active:before{content:"";position:absolute;left:-10px;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:#2563eb}
      .workspace-app .nav-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex:0 0 26px;border-radius:8px;color:#64748b;background:transparent;transition:color .16s,background .16s}
      .workspace-app .nav-link.active .nav-icon{color:#2563eb;background:transparent}
      .workspace-app .nav-group{margin:6px 0}
      .workspace-app .nav-group-header{display:flex;align-items:center;gap:11px;width:100%;border-radius:10px;margin:2px 10px;padding:10px 12px;border:1px solid transparent;background:transparent;text-align:left;transition:background .14s,color .14s}
      .workspace-app .nav-group-header:hover{background:#f8fafc;border-color:#eef2f7}
      .workspace-app .nav-group.expanded>.nav-group-header{background:#f8fafc}
      .workspace-app .nav-group.active-context>.nav-group-header{background:#f5f3ff}
      .workspace-app .nav-group.active-context>.nav-group-header .nav-group-icon{color:#7c3aed!important}
      .workspace-app .nav-group-chevron{flex:0 0 auto;color:#94a3b8;transform:rotate(-90deg);transition:transform .16s}
      .workspace-app .nav-group-chevron.expanded{transform:rotate(0deg)}
      .workspace-app .nav-group-children{display:flex;flex-direction:column;padding-bottom:4px}
      .workspace-app .nav-group-flyout{display:none}
      .workspace-app .nav-group-flyout-title{padding:6px 10px 8px;font-size:10.5px;font-weight:800;letter-spacing:.06em;color:#94a3b8;text-transform:uppercase}
      .workspace-app .nav-child-link{margin:1px 10px 1px 26px;padding:7px 10px}
      .workspace-app .sidebar.collapsed .nav-group-flyout .nav-child-link{margin:1px 4px}
      /* Level-1 (group header / single-child promoted link) vs Level-2 (child)
         must read as unmistakably different weights — bold navy vs lighter,
         smaller slate. Several legacy theme files apply "!important" color
         overrides to the shared .nav-link class (which .nav-child-link and
         .nav-group-link both also carry, for their :active styling). Against
         a competing "!important" rule, specificity alone never wins — only
         "!important" beats "!important" (then specificity, then source order)
         — so every declaration here needs BOTH the .workspace-app.workspace-app
         specificity-double AND its own "!important" to be unconditionally safe.

         The same collision also hits layout, not just color: qms-enterprise-
         redesign.css has its own "!important" .nav-link{margin:2px 6px} and
         generic .nav-icon{width:27px;height:27px} rules. Without a matching
         "!important" override here, EVERY promoted single-child link (EMR;
         Cấu hình hệ thống) and every real child link silently loses its
         intended margin/icon-size — which is exactly why EMR read as visually
         indistinguishable from a child row: neither the wider group-link
         margin nor the smaller child-icon size was ever actually applied. */
      .workspace-app.workspace-app .nav-group-header,.workspace-app.workspace-app .nav-group-label{color:#7c3aed!important;font-weight:800!important;font-size:13.5px!important;letter-spacing:.01em}
      .workspace-app.workspace-app .nav-group.active-context>.nav-group-header,.workspace-app.workspace-app .nav-group.active-context>.nav-group-header .nav-group-label{color:#6d28d9!important}
      .workspace-app.workspace-app .nav-group-link{color:#7c3aed!important;font-weight:800!important;font-size:13.5px!important;margin:6px 10px!important}
      /* brand-overrides.css's generic .nav-link-label{overflow:hidden;
         text-overflow:ellipsis;white-space:nowrap} truncates a promoted
         single-child group's label the same as a real (level-2) child link —
         but a promoted link reads as a Level-1 item and should wrap onto a
         second line instead, exactly like a real multi-child .nav-group-label
         already does (it was never given that nowrap/ellipsis rule). Long
         Vietnamese labels (THEO DÕI HÀNH NGHỀ, MUA SẮM & SỬA CHỮA, CẤU HÌNH
         HỆ THỐNG) were silently losing their tail behind "..." until this. */
      .workspace-app.workspace-app .nav-group-link .nav-link-label{color:inherit!important;font-weight:inherit!important;font-size:inherit!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important}
      .workspace-app.workspace-app .nav-group-link.active,.workspace-app.workspace-app .nav-group-link.active .nav-link-label{background:#f5f3ff!important;color:#6d28d9!important}
      /* final-visual-lock.css (loaded last) sets a blanket
         .nav-link.active svg{color:#ffffff!important} for its own solid-blue
         active background — but .nav-group-link.active here uses a near-white
         violet tint instead, so that white icon silently disappears into it.
         Real bug reported from a screenshot: the active item in the collapsed
         rail showed a colored pill with no visible icon at all. .nav-child-link
         already has its own active-icon override (line below); the promoted
         single-child link never did. */
      .workspace-app.workspace-app .nav-group-link.active .nav-icon,.workspace-app.workspace-app .nav-group-link.active svg{color:#6d28d9!important}
      .workspace-app.workspace-app .nav-child-link,.workspace-app.workspace-app .nav-child-link .nav-link-label{color:#60a5fa!important;font-weight:600!important;font-size:12px!important}
      .workspace-app.workspace-app .nav-child-link{margin:1px 10px 1px 26px!important}
      /* The collapsed-rail flyout popover is a small floating popup, not the
         full sidebar list — its child links intentionally use a flat, compact
         margin (no 26px indent, there is no parent row to indent under
         inside the popover). This needs its own !important + higher
         specificity, or the generic 26px-indent rule above (now !important
         to survive qms-enterprise-redesign.css) would leak into it too. */
      .workspace-app.workspace-app .sidebar.collapsed .nav-group-flyout .nav-child-link{margin:1px 4px!important}
      .workspace-app.workspace-app .nav-child-link .nav-icon{color:#60a5fa!important;width:20px!important;height:20px!important;flex:0 0 20px!important}
      .workspace-app.workspace-app .nav-child-link:hover,.workspace-app.workspace-app .nav-child-link:hover .nav-link-label{color:#1d4ed8!important}
      .workspace-app.workspace-app .nav-child-link.active,.workspace-app.workspace-app .nav-child-link.active .nav-link-label{background:#eff6ff!important;color:#1d4ed8!important;font-weight:800!important}
      /* Same white-icon-on-light-background bug as nav-group-link.active
         above: qms-enterprise-redesign.css / qarica-design-system.css /
         final-visual-lock.css all carry a same-specificity "!important"
         .nav-link.active svg{color:...} rule (teal, dark blue, then white —
         last loaded wins), which sets the <svg>'s own color directly and so
         always beats a rule that only targets the wrapping .nav-icon span,
         no matter how specific that span rule is. Must target svg itself. */
      .workspace-app.workspace-app .nav-child-link.active .nav-icon,.workspace-app.workspace-app .nav-child-link.active svg{color:#2563eb!important}
      @media(max-width:860px){
        .workspace-app .nav-group-flyout{display:none!important}
        .workspace-app .nav-group-header{min-height:46px;padding:11px 12px}
        .workspace-app .nav-child-link{min-height:44px;padding:11px 10px}
      }
      .workspace-app .nav-attention-badge{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;font-size:11px;font-weight:800;line-height:1;color:#fff;flex:0 0 auto}
      .workspace-app .nav-attention-badge.warning{background:#d97706}
      .workspace-app .nav-attention-badge.urgent{background:#dc2626}
      .workspace-app .sidebar.collapsed .nav-attention-badge{position:absolute;right:5px;top:4px;min-width:16px;height:16px;padding:0 4px;font-size:9px;border:2px solid #fff}
      .workspace-app .sidebar.collapsed .nav-group-flyout .nav-attention-badge{position:static;min-width:20px;height:20px;padding:0 6px;font-size:11px;border:0}
      .workspace-app .sidebar-bottom{position:absolute;left:0;right:0;bottom:0;background:#fff}
      .workspace-app .sidebar-footer{position:static;border-top:1px solid #f1f5f9;padding:12px 14px}
      .workspace-app .nav-footer-divider{height:1px;background:#eef2f7;margin:10px 14px}
      .workspace-app .sidebar-nav{padding-bottom:110px}
      .workspace-app .scope-chip{color:#64748b;font-size:11px;margin-bottom:8px}
      .workspace-app .sidebar-collapse-text{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:#64748b;font-size:12.5px;font-weight:700;padding:6px 4px;cursor:pointer;border-radius:8px}
      .workspace-app .sidebar-collapse-text:hover{background:#f8fafc;color:#0f172a}
      .workspace-app .workspace-strip{background:#fff;border-bottom:1px solid #e5eaf2}
      .workspace-app .workspace-tab{border-radius:10px;color:#64748b}
      .workspace-app .workspace-tab.active{background:#eff6ff;color:#1d4ed8}
      @media(max-width:760px){
        .workspace-app .topbar,.workspace-app .main-shell.sidebar-collapsed .topbar{left:0!important;right:0!important;width:auto!important}
        .workspace-app{padding-top:0!important;margin-top:0!important}
        .workspace-app .main-shell{padding-top:64px!important;margin-top:0!important}
        .workspace-app .topbar{top:0!important;padding:9px 12px;gap:10px;display:flex;align-items:center;justify-content:space-between}
        .workspace-app .topbar-left{display:flex;align-items:center;flex:0 0 auto;min-width:36px}
        .workspace-app .topbar-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1 1 auto;min-width:0}
        .workspace-app .topbar-right>*{flex:0 0 auto}
        .workspace-app .top-search{display:none}
        .workspace-app .org-pill{display:none}
        .workspace-app .org-title{display:flex;flex-direction:column;min-width:0;flex:1;max-width:none}
        .workspace-app .mobile-brand-name{display:block!important;color:#1d4ed8!important;font-size:16px!important;font-weight:900!important;letter-spacing:.02em!important}
        .workspace-app .qarica-header-mark,.workspace-app .qarica-header-name,.workspace-app .qarica-header-divider{display:none!important}
        .workspace-app .assistant-topbar{display:none!important}
        .workspace-app .profile-copy{display:none}
      }
    `}</style>
    {navigating ? <div className="route-progress" aria-label="Đang chuyển trang"><span /></div> : null}
    <aside className={`sidebar ${mobileOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Image src="/brand/qarica-mark-v2.svg" alt="" width={32} height={32} aria-hidden="true" /></div><div className="sidebar-brand-copy"><strong>QARICA</strong><span>Quality</span></div><button className="icon-button sidebar-collapse" onClick={toggleSidebarCollapsed} title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}><Icon name={sidebarCollapsed ? "panel-left-open" : "panel-left-close"} size={18} /></button><button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><Icon name="x" /></button></div>
      <nav className="sidebar-nav" aria-label="Điều hướng chính">
        {mainNavGroups.map(renderGroup)}
        <div className="nav-footer-divider" aria-hidden="true" />
        {footerNavGroups.map(renderGroup)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-footer"><div className="scope-chip">{user.scopeTypes.includes("HOSPITAL") ? "Phạm vi: Toàn viện" : `Phạm vi: ${user.primaryDepartmentName || "Được phân công"}`}</div><button type="button" className="sidebar-collapse-text" onClick={toggleSidebarCollapsed}><Icon name="panel-left-close" size={16} /><span>Thu gọn</span></button></div>
      </div>
    </aside>
    {mobileOpen ? <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" /> : null}
    <div className={`main-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar qarica-topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button><div className="qarica-header-brand"><Image className="qarica-header-mark" src="/brand/qarica-mark-v2.svg" alt="" width={26} height={26} aria-hidden="true" /><strong className="qarica-header-name">QARICA</strong><span className="qarica-header-divider" aria-hidden="true"/></div></div><div className="topbar-right">{organization?.name ? <span className="org-pill"><Icon name="building-2" size={14} />{organization.name}</span> : null}<YearSelector value={year} /><NotificationBell />{adminHref ? <Link href={adminHref} className={`icon-button header-icon admin-launcher ${pathname.startsWith("/admin") ? "active" : ""}`} onClick={() => startNavigation(adminHref)} title="Quản trị hệ thống" aria-label="Quản trị hệ thống"><Icon name="settings" size={18} /></Link> : null}<div className="profile-menu-wrap"><button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}><span className="avatar">{initials}</span><span className="profile-copy"><strong>{displayName}</strong><small>{user.roleNames[0] || user.roleCodes[0] || user.primaryDepartmentName || user.email}</small></span><Icon name="chevron-down" size={16} /></button>{profileOpen ? <div className="profile-dropdown"><div className="profile-dropdown-head"><strong>{displayName}</strong><span>{user.roleNames.join(" · ") || user.roleCodes.join(" · ") || "USER"}</span></div><button onClick={logout}><Icon name="logout" size={17} /> Đăng xuất</button></div> : null}</div></div></header>
      {workspace && workspace.tabs.length > 1 ? <div className="workspace-strip"><div className="workspace-strip-inner"><div className="workspace-context"><span>{workspace.eyebrow}</span><strong>{workspace.title}</strong></div><nav className="workspace-tabs" aria-label={`Chức năng ${workspace.title}`}>{workspace.tabs.map((tab) => { const active = isWorkspaceTabActive(pathname, tab.href); return <Link key={tab.href} href={tab.href} className={`workspace-tab ${active ? "active" : ""}`} onClick={() => startNavigation(tab.href)}>{tab.label}</Link>; })}</nav></div></div> : null}
      <main className="content">{children}</main>
    </div>
  </div>;
}
