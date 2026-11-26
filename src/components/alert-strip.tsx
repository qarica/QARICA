"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { AlertStripItem } from "@/lib/quality-alert-strip";

export type { AlertStripItem };

export function AlertStrip({ items, emptyText }: { items: AlertStripItem[]; emptyText?: string }) {
  if (!items.length) return <div className="empty-state compact">{emptyText || "Không có cảnh báo nào đang mở."}</div>;
  return <div className="alert-strip">
    {items.map((item, i) => (
      <Link href={item.href} className="alert-strip-card" key={`${item.href}-${i}`}>
        <span className={`alert-strip-eyebrow ${item.tone}`}>{item.eyebrow}</span>
        <span className="alert-strip-row">
          <span className="alert-strip-title"><Icon name={item.icon} size={14} />{item.title}</span>
          <span className="alert-strip-action">{item.actionText} →</span>
        </span>
        {item.sub ? <span className="alert-strip-sub">{item.sub}</span> : null}
      </Link>
    ))}
  </div>;
}
