"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

// EMR's 10 workspace destinations (Tổng quan EMR + 9 categories) live outside
// the shared workspace-navigation.ts/workspace-strip mechanism — EMR was
// deliberately kept off that registry (see src/lib/navigation.ts) so its
// single main-sidebar entry doesn't explode into 10 sidebar rows. This strip
// is EMR's own Level-2 navigation, rendered once and shared by the overview
// and every category page so all 10 stay reachable on desktop AND mobile via
// one horizontally-scrollable row (no separate mobile-only mechanism to drift
// out of sync).
const DESTINATIONS = [
  { slug: "", label: "Tổng quan EMR", icon: "layout-dashboard" },
  ...EMR_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, icon: c.icon })),
];

export function EmrWorkspaceNav() {
  const pathname = usePathname();
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = railRef.current?.querySelector<HTMLElement>("a.emr-tab.active");
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  return (
    <nav className="emr-workspace-nav" aria-label="Điều hướng EMR">
      <div className="emr-workspace-nav-rail" ref={railRef}>
        {DESTINATIONS.map((d) => {
          const href = d.slug ? `/emr/${d.slug}` : "/emr";
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`emr-tab ${active ? "active" : ""}`}>
              <Icon name={d.icon} size={15} />
              <span>{d.label}</span>
            </Link>
          );
        })}
      </div>
      <style>{`
        .emr-workspace-nav{background:#fff;border:1px solid #e5eaf2;border-radius:14px;padding:6px;margin-bottom:2px}
        .emr-workspace-nav-rail{display:flex;gap:4px;overflow-x:auto;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
        .emr-tab{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:9px 13px;min-height:40px;border-radius:10px;color:#64748b;font-size:12.5px;font-weight:700;white-space:nowrap;transition:background .14s,color .14s}
        .emr-tab:hover{background:#f8fafc;color:#0f172a}
        .emr-tab.active{background:#eff6ff;color:#1d4ed8}
        @media(max-width:760px){
          .emr-workspace-nav{border-radius:12px;padding:5px}
          .emr-tab{padding:10px 12px;min-height:44px;font-size:12px}
        }
      `}</style>
    </nav>
  );
}
