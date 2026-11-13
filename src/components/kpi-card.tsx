"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";

export type KpiTone = "blue" | "green" | "amber" | "red" | "purple";
// arrow (mặc định true): ▲/▼ chỉ đúng nghĩa cho trend tăng/giảm thật (vd %
// so với tháng trước, xem Dashboard). Khi "down"/"up" chỉ dùng để tô màu 1
// badge đếm số (vd "3 ≥7 ngày quá hạn" ở trang Việc của tôi) chứ không phải
// trend thật, truyền arrow:false để không hiện mũi tên sai nghĩa.
export type KpiTrend = { tone: "up" | "down" | "flat"; text: string; arrow?: boolean };
export type KpiFooter = { text: string; href: string };

export function KpiCard({
  icon, tone = "blue", label, value, trend, visual, caption, urgent, footer, href,
}: {
  icon: string;
  tone?: KpiTone;
  label: string;
  value: React.ReactNode;
  trend?: KpiTrend;
  visual?: React.ReactNode;
  caption?: React.ReactNode;
  urgent?: boolean;
  footer?: KpiFooter;
  href?: string;
}) {
  const className = `kpi-tile${urgent ? " urgent" : ""}`;
  const showArrow = trend?.arrow !== false;
  const body = <>
    <div className="kpi-tile-top">
      <span className={`kpi-icon ${tone}`}><Icon name={icon} size={18} /></span>
      {trend ? <span className={`kpi-trend ${trend.tone}`}>{showArrow ? (trend.tone === "up" ? "▲ " : trend.tone === "down" ? "▼ " : "") : ""}{trend.text}</span> : null}
    </div>
    <div className="kpi-tile-value">{value}</div>
    {visual ? <div className="kpi-tile-visual">{visual}</div> : null}
    <div className="kpi-tile-label">{label}</div>
    {caption ? <div className="kpi-tile-caption">{caption}</div> : null}
    {footer ? <Link className="kpi-tile-foot" href={footer.href}>{footer.text}</Link> : null}
  </>;
  return href
    ? <Link href={href} className={`${className} kpi-tile-link`}>{body}</Link>
    : <article className={className}>{body}</article>;
}
