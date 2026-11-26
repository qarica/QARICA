"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { KANBAN_COLUMNS, daysUntilExpiry, formatQuantity, itemStockStatus, compareStockUrgency, kanbanColumnFor, lotExpiryStatus, sortLotsFefo, type KanbanColumnKey, fmtDate } from "../lib/lab-supplies";
import { num, type Item, type Lot } from "./lab-supplies-types";

// TỒN KHO = màn hình mở đầu, trả lời "còn gì, cần làm gì". Một khái niệm duy nhất: mỗi vật tư thuộc đúng MỘT trạng thái
// (Hết hàng / Có lô hết hạn / Dưới định mức / Lô sắp hết hạn / Đủ hàng). Các ô đếm phía trên chính là bộ lọc; cùng dữ
// liệu hiển thị dạng Danh sách hoặc Kanban (không có 2 nơi làm cùng một việc).
export function LabStock({ items, lots, today, canManage, search, onOpen, onReceive, onIssue }: { items: Item[]; lots: Lot[]; today: string; canManage: boolean; search: string; onOpen: (id: string) => void; onReceive: (item: Item) => void; onIssue: (item: Item) => void }) {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [filter, setFilter] = useState<"ALL" | KanbanColumnKey>("ALL");
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => {
    const byItem = new Map<string, Lot[]>();
    for (const l of lots) byItem.set(l.item_id, [...(byItem.get(l.item_id) || []), l]);
    return items.map((item) => {
      const itemLots = sortLotsFefo((byItem.get(item.id) || []).map((l) => ({ ...l, lot_number: l.lot_number, expiry_date: l.expiry_date })));
      const total = itemLots.reduce((s, l) => s + num(l.balance), 0);
      const states = itemLots.map((l) => lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today));
      const expired = states.filter((s) => s === "EXPIRED").length;
      const expiring = states.filter((s) => s === "EXPIRING").length;
      const stock = itemStockStatus(total, num(item.min_stock));
      return { item, total, expired, expiring, stock, column: kanbanColumnFor(stock, expired, expiring), nextExpiry: itemLots.find((l) => l.expiry_date)?.expiry_date ?? null };
    }).sort(compareStockUrgency);
  }, [items, lots, today]);

  const q = search.trim().toLowerCase();
  const base = rows.filter((r) => (showInactive || r.item.is_active || r.total > 0) && (!q || [r.item.code, r.item.barcode, r.item.name, r.item.manufacturer].some((v) => (v || "").toLowerCase().includes(q))));
  const count = (key: KanbanColumnKey) => base.filter((r) => r.column === key).length;
  const visible = filter === "ALL" ? base : base.filter((r) => r.column === filter);
  const toneOf = (key: KanbanColumnKey) => KANBAN_COLUMNS.find((c) => c.key === key)!;

  return (
    <section className="panel">
      <div className="ls-attn" role="group" aria-label="Lọc theo tình trạng">
        <button type="button" className={`ls-attn-card ${filter === "ALL" ? "active" : ""}`} aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}><span>Tất cả vật tư</span><strong>{base.length}</strong></button>
        {KANBAN_COLUMNS.map((c) => (
          <button type="button" key={c.key} className={`ls-attn-card ${c.tone} ${filter === c.key ? "active" : ""}`} aria-pressed={filter === c.key} title={c.hint} onClick={() => setFilter(filter === c.key ? "ALL" : c.key)}>
            <span>{c.label}</span><strong>{count(c.key)}</strong>
          </button>
        ))}
      </div>

      <div className="ls-bar">
        <div className="ls-seg" role="group" aria-label="Cách xem">
          <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>Danh sách</button>
          <button type="button" className={view === "kanban" ? "active" : ""} aria-pressed={view === "kanban"} onClick={() => setView("kanban")}>Kanban</button>
        </div>
        <label className="inline-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện vật tư ngưng dùng</label>
        <details className="ls-menu">
          <summary className="button secondary"><Icon name="download" size={16} /> Xuất Excel</summary>
          <div className="ls-menu-list">
            <a href="/api/lab-supplies/export?type=stock" download>Tồn kho hiện tại (theo vật tư và theo lô)</a>
            <a href="/api/lab-supplies/export?type=replenish" download>Danh sách cần bổ sung / đặt hàng</a>
          </div>
        </details>
      </div>

      {view === "list" ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th className="ls-stt">STT</th><th>Mã</th><th>Vật tư</th><th className="ls-num">Tồn</th><th className="ls-num">Định mức</th><th>Tình trạng</th><th>Hạn gần nhất</th>{canManage ? <th /> : null}</tr></thead>
            <tbody>
              {visible.map((r, idx) => {
                const col = toneOf(r.column);
                const days = daysUntilExpiry(r.nextExpiry, today);
                return (
                  <tr key={r.item.id}>
                    <td className="ls-stt">{idx + 1}</td>
                    <td><code className="code-pill">{r.item.code}</code></td>
                    <td><button type="button" className="table-link ls-name-btn" onClick={() => onOpen(r.item.id)}><strong>{r.item.name}</strong></button>{!r.item.is_active ? <span className="status-badge muted">Ngưng dùng</span> : null}</td>
                    <td className="ls-num"><strong>{formatQuantity(r.total)}</strong> {r.item.unit}</td>
                    <td className="ls-num">{num(r.item.min_stock) > 0 ? formatQuantity(r.item.min_stock) : "—"}</td>
                    <td>
                      <span className={`status-badge ${col.tone}`}>{col.label}</span>
                      {r.column !== "EXPIRED" && r.expired ? <span className="status-badge danger">{r.expired} lô hết hạn</span> : null}
                      {r.column !== "EXPIRING" && r.expiring ? <span className="status-badge warning">{r.expiring} lô sắp hết hạn</span> : null}
                    </td>
                    <td>{r.nextExpiry ? <>{fmtDate(r.nextExpiry)}{days !== null && days >= 0 && days <= r.item.expiry_warning_days ? <span className="subline">còn {days} ngày</span> : null}</> : "—"}</td>
                    {canManage ? (
                      <td className="ls-num"><span className="ls-row-actions"><button type="button" className="button tertiary small" onClick={() => onReceive(r.item)}>Nhập</button><button type="button" className="button tertiary small" disabled={r.total <= 0} onClick={() => onIssue(r.item)}>Xuất</button></span></td>
                    ) : null}
                  </tr>
                );
              })}
              {!visible.length ? <tr><td colSpan={canManage ? 8 : 7}><div className="empty-state">{items.length ? "Không có vật tư phù hợp." : "Kho chưa có vật tư. Thêm ở tab Danh mục (hoặc nhập từ Excel), rồi nhập kho."}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ls-kanban">
          {KANBAN_COLUMNS.map((col) => {
            const cards = base.filter((r) => r.column === col.key);
            return (
              <div className={`ls-kcol ${col.tone}`} key={col.key} aria-label={`Cột ${col.label}`}>
                <div className="ls-kcol-head"><strong>{col.label}</strong><span className={`status-badge ${col.tone}`}>{cards.length}</span></div>
                <small>{col.hint}</small>
                {cards.map((c) => (
                  <button type="button" className="ls-kcard" key={c.item.id} onClick={() => onOpen(c.item.id)}>
                    <span className="ls-kcard-code">{c.item.code}</span>
                    <strong>{c.item.name}</strong>
                    <span>Tồn <b>{formatQuantity(c.total)}</b> {c.item.unit}{num(c.item.min_stock) > 0 ? ` · định mức ${formatQuantity(c.item.min_stock)}` : ""}</span>
                    {c.nextExpiry ? <span className="muted">Hạn gần nhất: {fmtDate(c.nextExpiry)}</span> : null}
                    {c.expired ? <span className="status-badge danger">{c.expired} lô hết hạn</span> : null}
                    {c.expiring ? <span className="status-badge warning">{c.expiring} lô sắp hết hạn</span> : null}
                  </button>
                ))}
                {!cards.length ? <div className="ls-kempty">Không có vật tư</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
