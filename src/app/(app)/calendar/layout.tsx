"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/calendar", label: "Lịch tổng hợp" },
  { href: "/calendar/recurring", label: "Công việc định kỳ" },
  { href: "/calendar/blueprint", label: "Bộ lịch nền & nguồn" },
  { href: "/calendar/gantt", label: "Gantt tiến độ" },
  { href: "/calendar/my-work", label: "Việc của tôi" },
];

export default function CalendarModuleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="calendar-module-shell">
    <style>{`
      .calendar-module-shell{display:grid;gap:12px}
      .calendar-module-nav{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:13px;width:max-content;max-width:100%}
      .calendar-module-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 11px;border-radius:9px;font-size:11px;font-weight:800;color:#475569;text-decoration:none;border:1px solid transparent}
      .calendar-module-nav a:hover{background:#f8fafc;color:#1e293b;border-color:#e2e8f0}
      .calendar-module-nav a.active{background:#2563eb;color:#fff}
      @media(max-width:760px){.calendar-module-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;padding:6px}.calendar-module-nav a{min-height:39px;text-align:center;white-space:normal}.calendar-module-nav a:last-child{grid-column:1/-1}}
    `}</style>
    <nav className="calendar-module-nav" aria-label="Điều hướng Lịch công tác QLCL">
      {TABS.map((tab) => <Link key={tab.href} href={tab.href} className={pathname === tab.href ? "active" : ""}>{tab.label}</Link>)}
    </nav>
    {children}
  </div>;
}
