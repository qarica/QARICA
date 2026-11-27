"use client";

import { useMemo } from "react";
import { Icon } from "@/components/icon";
import { summarizeStockAlerts, type KanbanColumnKey, type SupplyKind } from "../lib/lab-supplies";
import type { Item, Lot } from "./lab-supplies-types";

/**
 * Banner nhắc việc ở đầu Kho: tính trực tiếp từ tồn và hạn dùng hiện có nên luôn đúng tại thời điểm mở màn hình
 * (không cần lịch chạy nền). Bấm vào từng mục để nhảy tới danh sách vật tư đã lọc sẵn ở tab Tồn kho.
 */
export function LabAlertBanner({ supplyKind, items, lots, today, onPick }: { supplyKind: SupplyKind; items: Item[]; lots: Lot[]; today: string; onPick: (key: KanbanColumnKey) => void }) {
  const s = useMemo(() => summarizeStockAlerts(items, lots, today), [items, lots, today]);
  if (s.total === 0) return null;
  const rows: { key: "EXPIRED" | "OUT" | "LOW" | "EXPIRING"; tone: string; text: string }[] = [
    { key: "EXPIRED", tone: "danger", text: `${s.items.EXPIRED} vật tư có lô đã hết hạn (${s.expiredLots} lô) — lập phiếu hủy` },
    { key: "OUT", tone: "danger", text: `${s.items.OUT} vật tư hết hàng — cần đặt hàng` },
    { key: "LOW", tone: "warning", text: `${s.items.LOW} vật tư dưới định mức — nên bổ sung` },
    { key: "EXPIRING", tone: "info", text: `${s.items.EXPIRING} vật tư có lô sắp hết hạn (${s.expiringLots} lô) — ưu tiên xuất trước` },
  ];
  return (
    <section className="ls-alert-banner" role="region" aria-label="Nhắc việc kho">
      <strong className="ls-alert-title"><Icon name="bell-ring" size={16} /> Cần xử lý</strong>
      <div className="ls-alert-items">
        {rows.filter((r) => s.items[r.key] > 0).map((r) => (
          <button key={r.key} type="button" className={`ls-alert-item ${r.tone}`} onClick={() => onPick(r.key)} title="Xem danh sách vật tư này ở tab Tồn kho">{r.text}</button>
        ))}
      </div>
      {s.items.OUT + s.items.LOW > 0 ? <a className="ls-alert-link" href={`/api/lab-supplies/export?type=replenish&kind=${supplyKind}`} download>Tải danh sách cần đặt hàng (.xlsx)</a> : null}
    </section>
  );
}
