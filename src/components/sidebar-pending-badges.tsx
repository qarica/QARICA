"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  permissions: string[];
  primaryDepartmentId: string | null;
  year: number;
};

function setBadge(href: string, count: number, tone: "red" | "orange") {
  const selector = `.workspace-app .nav-link[href="${href}"]`;
  document.querySelectorAll<HTMLAnchorElement>(selector).forEach((node) => {
    node.classList.remove("nav-badge-red", "nav-badge-orange");
    if (count > 0) {
      node.dataset.navBadge = count > 99 ? "99+" : String(count);
      node.classList.add(tone === "red" ? "nav-badge-red" : "nav-badge-orange");
      node.setAttribute("aria-label", `${node.textContent?.trim() || "Mục điều hướng"}: ${count} mục cần xử lý`);
    } else {
      delete node.dataset.navBadge;
      node.removeAttribute("aria-label");
    }
  });
}

export function SidebarPendingBadges({ userId, permissions, primaryDepartmentId, year }: Props) {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const canVerifyTasks = permissions.includes("plans.manage");
        const canManageDirectives = permissions.includes("directives.manage");
        const [tasksRes, directivesRes, recordsRes] = await Promise.all([
          supabase.from("vw_actions_dashboard").select("action_id,workflow_status,is_overdue,days_to_due,assignee_user_id").eq("work_year", year),
          supabase.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,lead_department_id,owner_user_id"),
          supabase.from("records").select("id").eq("work_year", year).eq("lifecycle_status", "ACTIVE"),
        ]);
        if (!active) return;

        const taskIds = new Set<string>();
        for (const task of (tasksRes.data ?? []) as any[]) {
          const assignedToMe = task.assignee_user_id === userId;
          const days = Number(task.days_to_due);
          const dueToday = Number.isFinite(days) && days === 0;
          const returned = task.workflow_status === "RETURNED";
          const overdue = Boolean(task.is_overdue);
          const needsVerification = canVerifyTasks && ["EVIDENCE_SUBMITTED", "VERIFYING"].includes(task.workflow_status);
          if ((assignedToMe && (overdue || dueToday || returned)) || needsVerification) taskIds.add(String(task.action_id));
        }

        const currentRecordIds = new Set((recordsRes.data ?? []).map((record: any) => String(record.id)));
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
        const todayMs = Date.parse(`${today}T00:00:00+07:00`);
        const directiveIds = new Set<string>();
        for (const directive of (directivesRes.data ?? []) as any[]) {
          if (!currentRecordIds.has(String(directive.record_id))) continue;
          if (["COMPLETED", "CANCELLED"].includes(String(directive.workflow_status))) continue;
          const mine = directive.owner_user_id === userId || (!!primaryDepartmentId && directive.lead_department_id === primaryDepartmentId);
          if (!canManageDirectives && !mine) continue;
          const due = directive.report_due_date || directive.implementation_due_date;
          if (!due) continue;
          const targetMs = Date.parse(`${String(due).slice(0, 10)}T00:00:00+07:00`);
          if (!Number.isFinite(targetMs) || !Number.isFinite(todayMs)) continue;
          const days = Math.round((targetMs - todayMs) / 86400000);
          if (days <= 7) directiveIds.add(String(directive.id));
        }

        setBadge("/tasks", taskIds.size, "red");
        setBadge("/directives", directiveIds.size, "orange");
      } catch {
        // Navigation stays fully usable if badge synchronization fails.
      }
    }

    const raf = window.requestAnimationFrame(load);
    const timer = window.setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [permissions, primaryDepartmentId, supabase, userId, year]);

  return null;
}
