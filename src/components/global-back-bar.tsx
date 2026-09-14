"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

const MODULE_ROOTS = [
  "/improvement/proposals", "/improvement/projects", "/external-assessments",
  "/calendar/recurring", "/calendar/blueprint", "/admin/permissions", "/admin/catalogs",
  "/admin/departments", "/admin/users", "/monitoring", "/directives", "/inspections",
  "/indicators", "/findings", "/incidents", "/capa", "/risks", "/fmea", "/assessments",
  "/evidence", "/audits", "/safety-alerts", "/feedback", "/reports", "/plans", "/tasks", "/calendar",
].sort((a, b) => b.length - a.length);

const EXACT_PARENT: Record<string, string> = {
  "/calendar/recurring": "/calendar", "/calendar/blueprint": "/calendar",
  "/external-assessments": "/assessments", "/improvement/proposals": "/improvement/projects",
  "/admin/permissions": "/admin/users", "/admin/catalogs": "/admin/users", "/admin/departments": "/admin/users",
};

function fallbackFor(pathname: string) {
  for (const root of MODULE_ROOTS) if (pathname !== root && pathname.startsWith(`${root}/`)) return root;
  return EXACT_PARENT[pathname] || "/dashboard";
}

function isModuleLanding(pathname: string) {
  return MODULE_ROOTS.includes(pathname) && !Object.prototype.hasOwnProperty.call(EXACT_PARENT, pathname);
}

export function GlobalBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = useRef(pathname);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname !== currentPath.current) {
      previousPath.current = currentPath.current;
      currentPath.current = pathname;
    }
  }, [pathname]);

  // Landing dashboards already expose their workspace navigation; a Back button here
  // only consumes vertical space and incorrectly suggests that the landing page is a detail view.
  if (pathname === "/dashboard" || isModuleLanding(pathname)) return null;

  function goBack() {
    const previous = previousPath.current;
    if (previous && previous !== pathname && previous.startsWith("/")) return router.push(previous);
    router.push(fallbackFor(pathname));
  }

  return <div className="global-back-bar" style={{ display: "flex", alignItems: "center", minHeight: 34, marginBottom: 8 }}>
    <button type="button" className="button secondary" onClick={goBack} title="Quay lại màn hình trước" aria-label="Quay lại màn hình trước">
      <Icon name="arrow-left" size={16} /><span>Quay lại</span>
    </button>
  </div>;
}
