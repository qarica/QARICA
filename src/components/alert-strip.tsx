"use client";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { AlertStripItem } from "@/lib/quality-alert-strip";

export type { AlertStripItem };

export function AlertStrip({ items, emptyText }: { items: AlertStripItem[]; emptyText?: string }) {
  if (!items.length) return <div className="empty-state compact">{emptyText || "Không có cảnh báo nào đang mở."}</div>;
  return <div className="alert-strip">
    {items.map((item, i) => (
      <Link href={item.href} className={`alert-strip-card ${item.tone}`} key={`${item.href}-${i}`}>
        <span className={`alert-strip-icon ${item.tone}`}><Icon name={item.icon} size={18} /></span>
        <span className="alert-strip-copy">
          <strong>{item.title}</strong>
          {item.sub ? <small>{item.sub}</small> : null}
        </span>
        {item.when ? <span className="alert-strip-when">{item.when}</span> : null}
      </Link>
    ))}
  </div>;
}
