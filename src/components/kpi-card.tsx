"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";

export type KpiTone = "blue" | "green" | "amber" | "red" | "purple";
export type KpiTrend = { tone: "up" | "down" | "flat"; text: string };

export function KpiCard({
  icon, tone = "blue", label, value, trend, visual, href,
}: {
  icon: string;
  tone?: KpiTone;
  label: string;
  value: React.ReactNode;
  trend?: KpiTrend;
  visual?: React.ReactNode;
  href?: string;
}) {
  const body = <>
    <div className="kpi-tile-top">
      <span className={`kpi-icon ${tone}`}><Icon name={icon} size={18} /></span>
      {trend ? <span className={`kpi-trend ${trend.tone}`}>{trend.tone === "up" ? "▲" : trend.tone === "down" ? "▼" : ""} {trend.text}</span> : null}
    </div>
    <div className="kpi-tile-value">{value}</div>
    {visual ? <div className="kpi-tile-visual">{visual}</div> : null}
    <div className="kpi-tile-label">{label}</div>
  </>;
  return href
    ? <Link href={href} className="kpi-tile kpi-tile-link">{body}</Link>
    : <article className="kpi-tile">{body}</article>;
}
