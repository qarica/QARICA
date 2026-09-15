"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NavSection, OrganizationInfo, UserContext } from "@/lib/types";
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

const RECORD_TYPE_NAV: Record<string, string> = {
  ACTION: "/tasks",
  PROGRAM: "/plans",
  DIRECTIVE: "/directives",
  REPORT: "/reports",
  INSPECTION: "/inspections",
  INDICATOR_MEASUREMENT: "/indicators",
  MONITORING: "/monitoring",
  FINDING: "/findings",
  INCIDENT: "/incidents",
  CAPA: "/capa",
  RISK: "/risks",
  IMPROVEMENT_PROJECT: "/improvement/projects",
  IMPROVEMENT_PROPOSAL: "/improvement/proposals",
  ASSESSMENT: "/assessments",
  EXTERNAL_ASSESSMENT: "/external-assessments",
  AUDIT: "/audits",
  SAFETY_ALERT: "/safety-alerts",
  FEEDBACK: "/feedback",
};

function normalizeNavRoute(route: string | null, nav: NavSection[]) {
  if (!route) return null;
  const base = route.split("?")[0];
  const visibleRoots = new Set(nav.flatMap((section) => section.items.map((item) => item.workspaceRoot || item.href.split("?")[0])));
  const workspaceRoot = workspaceRootForPath(base);
  if (workspaceRoot && visibleRoots.has(workspaceRoot)) return workspaceRoot;
  const hrefs = nav.flatMap((section) => section.items.map((item) => item.href.split("?")[0]));
  return [...hrefs].sort((a, b) => b.length - a.length).find((href) => base === href || base.startsWith(`${href}/`)) ?? null;
}

export function AppShell({ children, user, organization, nav, year }: { children: React.ReactNode; user: UserContext; organization: OrganizationInfo | null; nav: NavSection[]; year: number; }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attention, setAttention] = useState<AttentionState>({});

  const workspace = visibleWorkspaceForPath(pathname, user);
  const currentWorkspaceRoot = workspaceRootForPath(pathname);
  const adminHref = adminLandingHref(user);
  const assistantAttention = attention["/assistant"];
  const tasksAttention = attention["/tasks"];

  useEffect(() => {
    setNavigating(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem("qlcl-sidebar-collapsed") === "1");
    } catch {
      // Keep expanded if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAttention() {
      const next = new Map<string, { ids: Set<string>; urgent: boolean }>();
      const add = (href: string | null, id: string, urgent: boolean) => {
        if (!href) return;
        const base = href.split("?")[0];
        const target = base === "/assistant" ? base : (workspaceRootForPath(base) || base);
        const current = next.get(target) ?? { ids: new Set<string>(), urgent: false };
        current.ids.add(id);
        current.urgent = current.urgent || urgent;
        next.set(target, current);
      };
      const addActionable = (href: string | null, id: string, urgent: boolean) => {
        add(href, id, urgent);
        if (href !== "/assistant") add("/assistant", id, urgent);
      };

      try {
        const canVerifyTasks = user.permissions.includes("plans.manage");
        const canConfirmMonitoring = user.permissions.includes("checklists.manage");
        const canManageDirectives = user.permissions.includes("directives.manage");
        const canManageReports = user.permissions.includes("reports.manage");
        const canManageRisks = user.permissions.includes("risk.manage");
        const canVerifyIndicators = user.permissions.includes("indicators.verify") || user.permissions.includes("indicators.manage");
        const canManageCapa = user.permissions.includes("capa.manage");
        const canManageFeedback = user.permissions.includes("feedback.manage");
        const canManageInspections = user.permissions.includes("inspections.manage") || user.permissions.includes("plans.manage");
        const canManageFindings = user.permissions.includes("findings.manage");

        const [recordsRes, noticesRes, tasksRes, monitoringRes, directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes] = await Promise.all([
          supabase.from("records").select("id").eq("work_year", year).eq("lifecycle_status", "ACTIVE"),
          supabase.from("notifications").select("id,priority,target_record_id,target_route").eq("is_read", false).order("created_at", { ascending: false }).limit(100),
          supabase.from("vw_actions_dashboard").select("action_id,workflow_status,is_overdue,days_to_due,assignee_user_id").eq("work_year", year),
          supabase.from("monitoring_rounds").select("id,record_id,workflow_status,scheduled_date,lead_assessor_id").in("workflow_status", ["SCHEDULED", "IN_PROGRESS", "AWAITING_CONFIRMATION"]),
          supabase.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,lead_department_id,owner_user_id"),
          supabase.from("reporting_obligations").select("id,record_id,workflow_status,due_date,preparing_department_id,preparer_user_id"),
          supabase.from("risks").select("id,record_id,workflow_status,next_review_date,owner_user_id"),
          supabase.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end"),
          supabase.from("capas").select("id,record_id,workflow_status,effectiveness_due_date"),
          supabase.from("feedback_records").select("id,record_id,workflow_status,response_due_at"),
          supabase.from("inspection_events").select("id,record_id,workflow_status,visit_date"),
          supabase.from("findings").select("id,record_id,workflow_status,due_date,owner_user_id"),
        ]);

        const currentRecordIds = new Set((recordsRes.data ?? []).map((x: any) => x.id));
        const inCurrentYear = (recordId: string | null | undefined) => !!recordId && currentRecordIds.has(recordId);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
        const todayMs = Date.parse(`${today}T00:00:00+07:00`);
        const daysTo = (value: string | null | undefined) => {
          if (!value) return null;
          const date = String(value).slice(0, 10);
          const targetMs = Date.parse(`${date}T00:00:00+07:00`);
          if (!Number.isFinite(targetMs) || !Number.isFinite(todayMs)) return null;
          return Math.round((targetMs - todayMs) / 86400000);
        };
        const mine = (ownerUserId?: string | null, departmentId?: string | null) => ownerUserId === user.id || (!!user.primaryDepartmentId && departmentId === user.primaryDepartmentId);

        const notificationRows = (noticesRes.data ?? []) as AttentionNotification[];
        const recordIds = Array.from(new Set(notificationRows.map((notice) => notice.target_record_id).filter(Boolean))) as string[];
        const recordTypeById = new Map<string, string>();
        if (recordIds.length) {
          const { data: records } = await supabase.from("records").select("id,record_type").in("id", recordIds);
          (records ?? []).forEach((record: any) => recordTypeById.set(record.id, record.record_type));
        }

        for (const notice of notificationRows) {
          const priority = String(notice.priority || "").toUpperCase();
          if (!["HIGH", "URGENT", "CRITICAL"].includes(priority)) continue;
          let href = normalizeNavRoute(notice.target_route, nav);
          if (!href && notice.target_record_id) href = RECORD_TYPE_NAV[recordTypeById.get(notice.target_record_id) || ""] || null;
          addActionable(href, `notice:${notice.id}`, true);
        }

        for (const task of (tasksRes.data ?? []) as any[]) {
          const assignedToMe = task.assignee_user_id === user.id;
          const days = Number(task.days_to_due);
          const dueToday = Number.isFinite(days) && days === 0;
          const returned = task.workflow_status === "RETURNED";
          const overdue = Boolean(task.is_overdue);
          const needsVerification = canVerifyTasks && ["EVIDENCE_SUBMITTED", "VERIFYING"].includes(task.workflow_status);
          if ((assignedToMe && (overdue || dueToday || returned)) || needsVerification) addActionable("/tasks", `task:${task.action_id}`, overdue || returned);
        }

        for (const round of (monitoringRes.data ?? []) as any[]) {
          if (!inCurrentYear(round.record_id)) continue;
          if (round.workflow_status === "AWAITING_CONFIRMATION" && canConfirmMonitoring) {
            addActionable("/monitoring", `monitoring:${round.id}`, false);
            continue;
          }
          if (round.lead_assessor_id !== user.id) continue;
          if (round.workflow_status === "IN_PROGRESS") {
            addActionable("/monitoring", `monitoring:${round.id}`, true);
            continue;
          }
          if (round.workflow_status === "SCHEDULED" && round.scheduled_date && round.scheduled_date <= today) addActionable("/monitoring", `monitoring:${round.id}`, round.scheduled_date < today);
        }

        for (const directive of (directivesRes.data ?? []) as any[]) {
          if (!inCurrentYear(directive.record_id) || ["COMPLETED", "CANCELLED"].includes(String(directive.workflow_status))) continue;
          if (!canManageDirectives && !mine(directive.owner_user_id, directive.lead_department_id)) continue;
          const days = daysTo(directive.report_due_date || directive.implementation_due_date);
          if (days !== null && days <= 7) addActionable("/directives", `directive:${directive.id}`, days < 0);
        }

        for (const report of (reportsRes.data ?? []) as any[]) {
          if (!inCurrentYear(report.record_id) || ["COMPLETED", "CANCELLED"].includes(String(report.workflow_status))) continue;
          if (!canManageReports && !mine(report.preparer_user_id, report.preparing_department_id)) continue;
          const days = daysTo(report.due_date);
          if (days !== null && days <= 7) addActionable("/reports", `report:${report.id}`, days < 0);
        }

        for (const risk of (risksRes.data ?? []) as any[]) {
          if (!inCurrentYear(risk.record_id) || risk.workflow_status === "RETIRED") continue;
          if (!canManageRisks && risk.owner_user_id !== user.id) continue;
          const days = daysTo(risk.next_review_date);
          if (days !== null && days <= 7) addActionable("/risks", `risk:${risk.id}`, days < 0);
        }

        for (const indicator of (indicatorsRes.data ?? []) as any[]) {
          if (!inCurrentYear(indicator.record_id)) continue;
          if (indicator.workflow_status === "SUBMITTED" && canVerifyIndicators) addActionable("/indicators", `indicator-verify:${indicator.id}`, false);
          if (indicator.result_level === "OUT_OF_TARGET") addActionable("/indicators", `indicator-out:${indicator.id}`, false);
        }

        for (const capa of (capasRes.data ?? []) as any[]) {
          if (!inCurrentYear(capa.record_id) || ["CLOSED", "CANCELLED"].includes(String(capa.workflow_status)) || !canManageCapa) continue;
          const days = daysTo(capa.effectiveness_due_date);
          if (capa.workflow_status === "EFFECTIVENESS_REVIEW" || (days !== null && days <= 7)) addActionable("/capa", `capa:${capa.id}`, days !== null && days < 0);
        }

        for (const feedback of (feedbackRes.data ?? []) as any[]) {
          if (!inCurrentYear(feedback.record_id) || ["CLOSED", "CANCELLED"].includes(String(feedback.workflow_status)) || !canManageFeedback) continue;
          const days = daysTo(feedback.response_due_at);
          if (days !== null && days <= 3) addActionable("/feedback", `feedback:${feedback.id}`, days < 0);
        }

        for (const inspection of (inspectionsRes.data ?? []) as any[]) {
          if (!inCurrentYear(inspection.record_id) || ["COMPLETED", "CANCELLED"].includes(String(inspection.workflow_status)) || !canManageInspections) continue;
          const days = daysTo(inspection.visit_date);
          if (days !== null && days <= 14) addActionable("/inspections", `inspection:${inspection.id}`, days < 0 || days <= 2);
        }

        for (const finding of (findingsRes.data ?? []) as any[]) {
          if (!inCurrentYear(finding.record_id) || ["CLOSED", "CANCELLED"].includes(String(finding.workflow_status))) continue;
          if (!canManageFindings && finding.owner_user_id !== user.id) continue;
          const days = daysTo(finding.due_date);
          if (days !== null && days <= 7) addActionable("/findings", `finding:${finding.id}`, days < 0);
        }

        if (active) {
          const state: AttentionState = {};
          next.forEach((value, href) => {
            state[href] = { count: value.ids.size, urgent: value.urgent };
          });
          setAttention(state);
        }
      } catch {
        // Navigation remains usable if attention synchronization fails.
      }
    }

    loadAttention();
    const timer = window.setInterval(loadAttention, 30000);
    const onFocus = () => loadAttention();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [nav, supabase, user.id, user.permissions, user.primaryDepartmentId, year]);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("qlcl-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // UI state still works without persistence.
      }
      return next;
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = (user.fullName || user.email || "QL")
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  function startNavigation(href: string) {
    const target = href.split("?")[0];
    if (target !== pathname) setNavigating(true);
    setMobileOpen(false);
  }

  function renderBadge(badge: { count: number; urgent: boolean } | undefined, className = "nav-attention-badge") {
    if (!badge?.count) return null;
    return <span className={`${className} ${badge.urgent ? "urgent" : "warning"}`}>{badge.count > 99 ? "99+" : badge.count}</span>;
  }

  return <div className="app-root workspace-app" style={{ ["--brand" as string]: organization?.primary_color || "#0d9488" }}>
    <style>{`
      .workspace-app{background:#eef4fb;color:#152b49}
      .workspace-app .topbar{background:rgba(255,255,255,.94);backdrop-filter:blur(14px);border-bottom:1px solid #d7e1ed;min-height:68px;padding:10px 22px;box-shadow:0 4px 18px rgba(22,59,64,.04)}
      .workspace-app .org-title strong{color:#152b49;font-size:14px;letter-spacing:-.01em}
      .workspace-app .org-title span{color:#65758a;font-size:10px;letter-spacing:.04em}.workspace-app .sidebar-brand-copy strong{color:#fff}.workspace-app .sidebar-brand-copy span{color:#b9cbe1}.workspace-app .nav-label{color:#c1d2e6}
      .workspace-app .assistant-topbar{border:1px solid #b9cbe1;background:#eaf2fb;color:#0d9488;border-radius:14px;padding:9px 13px;gap:8px;transition:.2s;box-shadow:none}
      .workspace-app .assistant-topbar:hover,.workspace-app .assistant-topbar.active{background:#dce9f7;border-color:#7fa4cd;color:#0f2138;transform:translateY(-1px)}
      .workspace-app .assistant-attention-badge{background:#d97706!important;color:#fff!important;border:2px solid #fff;min-width:18px;height:18px}
      .workspace-app .header-icon,.workspace-app .icon-button{border-radius:12px}
      .workspace-app .profile-button{border:1px solid #e2ebeb;background:#fff;border-radius:14px;padding:5px 8px 5px 6px;gap:8px}
      .workspace-app .profile-button:hover{background:#f3f7fc;border-color:#b9cbe1}
      .workspace-app .avatar{background:linear-gradient(135deg,#14b8a6,#0d9488);box-shadow:0 4px 10px rgba(21,92,103,.18)}
      .workspace-app .sidebar{background:linear-gradient(180deg,#0f2138 0%,#16324f 100%);border-right:1px solid #294f82;color:#edf4fc}
      .workspace-app .sidebar-brand{background:#0f2138;border-bottom:1px solid rgba(255,255,255,.14)}
      .workspace-app .brand-mark{width:48px;height:48px;border-radius:14px;background:transparent;box-shadow:none}.workspace-app .brand-mark img{width:48px;height:48px;display:block}
      .workspace-app .nav-link{border-radius:12px;margin:2px 10px;padding:10px 12px;color:#e8f0fa}
      .workspace-app .nav-link:hover{background:rgba(121,169,216,.16);color:#fff}
      .workspace-app .nav-link.active{background:#14b8a6;color:#fff;font-weight:800;box-shadow:inset 3px 0 #b8d6f2}
      .workspace-app .workspace-strip{background:#fff;border-bottom:1px solid #d7e1ed}
      .workspace-app .workspace-tab{border-radius:10px;color:#65758a}
      .workspace-app .workspace-tab.active{background:#e6fbf8;color:#0d9488}
      @media(max-width:760px){.workspace-app .topbar{padding:9px 12px}.workspace-app .org-title{display:none}.workspace-app .assistant-topbar span{display:none}.workspace-app .assistant-topbar{padding:10px}.workspace-app .profile-copy{display:none}}
    `}</style>
    {navigating ? <div className="route-progress" aria-label="Đang chuyển trang"><span /></div> : null}

    <aside className={`sidebar ${mobileOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-mark"><img src="/brand/qlcl-mark.svg" alt="" /></div>
        <div className="sidebar-brand-copy"><strong>QLCL</strong><span>TQM</span></div>
        <button className="icon-button sidebar-collapse" onClick={toggleSidebarCollapsed} title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}><Icon name={sidebarCollapsed ? "panel-left-open" : "panel-left-close"} size={18} /></button>
        <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><Icon name="x" /></button>
      </div>

      <nav className="sidebar-nav" aria-label="Điều hướng chính">
        {nav.map((section) => <div className="nav-section" key={section.label}>
          <div className="nav-label">{section.label}</div>
          {section.items.map((item) => {
            const baseHref = item.href.split("?")[0];
            const itemRoot = item.workspaceRoot || baseHref;
            const active = item.workspaceRoot
              ? currentWorkspaceRoot === item.workspaceRoot
              : pathname === baseHref || (baseHref !== "/dashboard" && pathname.startsWith(`${baseHref}/`));
            const badge = attention[itemRoot];
            return <Link
              key={`${itemRoot}:${item.label}`}
              href={item.href}
              prefetch={true}
              className={`nav-link ${active ? "active" : ""}`}
              title={sidebarCollapsed ? item.label : undefined}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              onClick={() => startNavigation(item.href)}
            >
              <Icon name={item.icon} size={18} />
              <span className="nav-link-label">{item.label}</span>
            </Link>;
          })}
        </div>)}
      </nav>

      <div className="sidebar-footer">
        <div className="scope-chip">{user.scopeTypes.includes("HOSPITAL") ? "Phạm vi: Toàn viện" : `Phạm vi: ${user.primaryDepartmentName || "Được phân công"}`}</div>
      </div>
    </aside>

    {mobileOpen ? <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" /> : null}

    <div className={`main-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button>
          <div className="org-title"><strong>{organization?.name || "Hệ thống Quản lý Chất lượng"}</strong><span>Quality Management Hub</span></div>
        </div>
        <div className="topbar-right">
          <Link href="/assistant" className={`assistant-topbar ${pathname.startsWith("/assistant") ? "active" : ""}`} onClick={() => startNavigation("/assistant")} title="Mở Trợ lý QLCL">
            <Icon name="sparkles" size={17} />
            <span>Trợ lý QLCL</span>
            {renderBadge(assistantAttention, "assistant-attention-badge")}
          </Link>
          <YearSelector value={year} />
          <NotificationBell />
          {adminHref ? <Link href={adminHref} className={`icon-button header-icon admin-launcher ${pathname.startsWith("/admin") ? "active" : ""}`} onClick={() => startNavigation(adminHref)} title="Quản trị hệ thống" aria-label="Quản trị hệ thống"><Icon name="settings" size={18} /></Link> : null}
          <div className="profile-menu-wrap">
            <button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <span className="avatar">{initials}</span>
              <span className="profile-copy"><strong>{user.fullName || "Người dùng"}</strong><small>{user.primaryDepartmentName || user.email}</small></span>
              <Icon name="chevron-down" size={16} />
            </button>
            {profileOpen ? <div className="profile-dropdown"><div className="profile-dropdown-head"><strong>{user.fullName || user.email}</strong><span>{user.roleCodes.join(" · ") || "USER"}</span></div><button onClick={logout}><Icon name="logout" size={17} /> Đăng xuất</button></div> : null}
          </div>
        </div>
      </header>

      {workspace && workspace.tabs.length > 1 ? <div className="workspace-strip">
        <div className="workspace-strip-inner">
          <div className="workspace-context"><span>{workspace.eyebrow}</span><strong>{workspace.title}</strong></div>
          <nav className="workspace-tabs" aria-label={`Chức năng ${workspace.title}`}>
            {workspace.tabs.map((tab) => {
              const active = isWorkspaceTabActive(pathname, tab.href);
              return <Link key={tab.href} href={tab.href} className={`workspace-tab ${active ? "active" : ""}`} onClick={() => startNavigation(tab.href)}>
                <Icon name={tab.icon} size={16} /><span>{tab.label}</span>
              </Link>;
            })}
          </nav>
        </div>
      </div> : null}

      <main className="content">{children}</main>
    </div>

    <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh">
      <Link href="/dashboard" className={pathname === "/dashboard" ? "active" : ""} onClick={() => startNavigation("/dashboard")}><Icon name="layout-dashboard" size={20} /><span>Tổng quan</span></Link>
      <Link href="/tasks" className={pathname.startsWith("/tasks") ? "active" : ""} onClick={() => startNavigation("/tasks")}><span className="mobile-nav-icon"><Icon name="check-square" size={20} /></span><span>Việc của tôi</span></Link>
      <Link href="/assistant" className={`mobile-assistant ${pathname.startsWith("/assistant") ? "active" : ""}`} onClick={() => startNavigation("/assistant")}><span className="mobile-assistant-icon"><Icon name="sparkles" size={21} />{renderBadge(assistantAttention, "mobile-nav-badge")}</span><span>Trợ lý</span></Link>
      <button type="button" className={mobileOpen ? "active" : ""} onClick={() => setMobileOpen(true)}><Icon name="menu" size={21} /><span>Menu</span></button>
    </nav>
  </div>;
}
