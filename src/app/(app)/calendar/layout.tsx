import Link from "next/link";

// Redeploy marker 2026-09-13: no functional change.
export default function CalendarModuleLayout({ children }: { children: React.ReactNode }) {
  return <div className="calendar-module-shell">
    <style>{`
      .calendar-module-shell{display:grid;gap:12px}
      .calendar-module-nav{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:13px;width:max-content;max-width:100%}
      .calendar-module-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 11px;border-radius:9px;font-size:11px;font-weight:800;color:#475569;text-decoration:none;border:1px solid transparent}
      .calendar-module-nav a:hover{background:#f8fafc;color:#1e293b;border-color:#e2e8f0}
      @media(max-width:760px){.calendar-module-nav{display:grid;grid-template-columns:1fr 1fr;width:100%;padding:6px}.calendar-module-nav a{min-height:39px;text-align:center}.calendar-module-nav a:last-child{grid-column:1/-1}}
    `}</style>
    <nav className="calendar-module-nav" aria-label="Điều hướng Lịch công tác QLCL">
      <Link href="/calendar">Lịch tổng hợp</Link>
      <Link href="/calendar/recurring">Công việc định kỳ</Link>
      <Link href="/calendar/blueprint">Bộ lịch nền & nguồn</Link>
    </nav>
    {children}
  </div>;
}
