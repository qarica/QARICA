"use client";

import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { printItemLabel } from "../lib/lab-supplies-label";
import { ADJUST_REASON_LABEL, CATEGORY_LABEL, MOVEMENT_LABEL, REASON_LABEL, daysUntilExpiry, formatQuantity, itemStockStatus, lotExpiryStatus, sortLotsFefo, type MovementType } from "../lib/lab-supplies";
import { callApi, num, type Item, type Lot } from "./lab-supplies-types";

type CardRow = { id: string; movement_date: string; movement_type: MovementType; quantity_delta: number | string; reference_no: string | null; counterparty: string | null; reason_code: string | null; lot: { lot_number: string } | null; balance: number };

// Chi tiết 1 vật tư (mở khi bấm tên vật tư / quét mã): tồn theo lô, vài phiếu gần nhất, và 3 việc thường làm
// (nhập, xuất, lập phiếu hủy nếu có lô hết hạn). Thẻ kho đầy đủ ở tab "Sổ kho & báo cáo".
export function LabItemDetail({ item, lots, today, canManage, onClose, onReceive, onIssue, onOpenCard, onChanged, onError }: {
  item: Item; lots: Lot[]; today: string; canManage: boolean; onClose: () => void;
  onReceive: (item: Item) => void; onIssue: (item: Item, mode?: "ISSUE" | "DISPOSAL", quantity?: number) => void; onOpenCard: (item: Item) => void;
  onChanged: (text: string) => void; onError: (text: string) => void;
}) {
  const [recent, setRecent] = useState<CardRow[] | null>(null);
  const [adjustLot, setAdjustLot] = useState<Lot | null>(null);
  const [adjust, setAdjust] = useState({ quantity: "", reason: "SHRINKAGE", note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecent(null);
    fetch(`/api/lab-supplies/items/${item.id}/card`)
      .then(async (r) => (r.ok ? ((await r.json()) as { rows: CardRow[] }).rows : []))
      .then((rows) => !cancelled && setRecent(rows.slice(-8).reverse()))
      .catch(() => !cancelled && setRecent([]));
    return () => { cancelled = true; };
  }, [item.id]);

  const itemLots = sortLotsFefo(lots.filter((l) => l.item_id === item.id)).map((lot) => ({ lot, state: lotExpiryStatus(lot.expiry_date, item.expiry_warning_days, today), days: daysUntilExpiry(lot.expiry_date, today) }));
  const total = itemLots.reduce((s, r) => s + num(r.lot.balance), 0);
  const stock = itemStockStatus(total, num(item.min_stock));
  const expiredTotal = itemLots.filter((r) => r.state === "EXPIRED").reduce((s, r) => s + num(r.lot.balance), 0);

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustLot) return;
    setBusy(true);
    try {
      await callApi("/api/lab-supplies/movements", "POST", { movement_type: "ADJUST", lot_id: adjustLot.lot_id, quantity: adjust.quantity, reason_code: adjust.reason, note: adjust.note });
      setAdjustLot(null);
      setAdjust({ quantity: "", reason: "SHRINKAGE", note: "" });
      onChanged("Đã ghi phiếu điều chỉnh.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không ghi được điều chỉnh.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card xl" role="dialog" aria-label={`Chi tiết vật tư ${item.code}`}>
        <div className="modal-head">
          <div><div className="eyebrow">{item.code}{item.barcode ? ` · mã vạch ${item.barcode}` : ""}</div><h2>{item.name}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>
        </div>
        <div className="modal-body form-stack">
          <div className="ls-detail-kpis">
            <div className="ls-kpi"><span>Tồn kho</span><strong>{formatQuantity(total)} {item.unit}</strong></div>
            <div className="ls-kpi"><span>Định mức tối thiểu</span><strong>{formatQuantity(item.min_stock)}</strong></div>
            <div className={`ls-kpi ${stock === "OK" ? "" : stock === "OUT" ? "bad" : "warn"}`}><span>Tình trạng</span><strong>{stock === "OUT" ? "Hết hàng" : stock === "LOW" ? "Dưới định mức" : "Đủ"}</strong></div>
          </div>
          <div className="ls-detail-meta">
            <span>{CATEGORY_LABEL[item.category]}</span>
            {item.manufacturer ? <span>Hãng: {item.manufacturer}</span> : null}
            {item.storage_condition ? <span>Bảo quản: {item.storage_condition}</span> : null}
            {!item.is_active ? <span className="status-badge muted">Ngưng dùng</span> : null}
          </div>
          {expiredTotal > 0 ? <div className="alert error">Có {formatQuantity(expiredTotal)} {item.unit} thuộc lô đã hết hạn — không xuất dùng được, cần lập phiếu hủy.</div> : null}

          <div className="table-wrap">
            <table>
              <thead><tr><th className="ls-stt">STT</th><th>Số lô</th><th>Hạn dùng</th><th className="ls-num">Tồn</th>{canManage ? <th /> : null}</tr></thead>
              <tbody>
                {itemLots.map((r, idx) => (
                  <tr key={r.lot.lot_id}>
                    <td className="ls-stt">{idx + 1}</td>
                    <td>{r.lot.lot_number}</td>
                    <td>{r.lot.expiry_date || "—"}{r.state === "EXPIRED" ? <span className="status-badge danger">Hết hạn</span> : null}{r.state === "EXPIRING" ? <span className="status-badge warning">Còn {r.days} ngày</span> : null}</td>
                    <td className="ls-num"><strong>{formatQuantity(r.lot.balance)}</strong> {item.unit}</td>
                    {canManage ? <td className="ls-num"><button type="button" className="button tertiary small" onClick={() => { setAdjustLot(r.lot); setAdjust({ quantity: "", reason: "SHRINKAGE", note: "" }); }}>Điều chỉnh</button></td> : null}
                  </tr>
                ))}
                {!itemLots.length ? <tr><td colSpan={canManage ? 5 : 4}><div className="empty-state">Chưa có lô nào còn tồn.</div></td></tr> : null}
              </tbody>
            </table>
          </div>

          {adjustLot ? (
            <form className="ls-adjust" onSubmit={submitAdjust}>
              <strong>Điều chỉnh lô {adjustLot.lot_number} (tồn sổ {formatQuantity(adjustLot.balance)} {item.unit})</strong>
              <div className="ls-head-grid">
                <label>Số lượng điều chỉnh (+ tăng / − giảm) *<input inputMode="decimal" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} placeholder="VD: -2" /></label>
                <label>Lý do<select value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}>{(["SHRINKAGE", "CORRECTION"] as const).map((k) => <option key={k} value={k}>{ADJUST_REASON_LABEL[k]}</option>)}</select></label>
                <label className="ls-span-2">Ghi chú *<input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="Lý do chi tiết (tối thiểu 3 ký tự)" /></label>
              </div>
              <div className="ls-row-actions"><button type="button" className="button secondary small" onClick={() => setAdjustLot(null)} disabled={busy}>Hủy</button><button className="button primary small" disabled={busy}>{busy ? "Đang ghi..." : "Ghi điều chỉnh"}</button></div>
            </form>
          ) : null}

          <div>
            <div className="ls-card-head"><strong>Phiếu gần đây</strong><button type="button" className="button tertiary small" onClick={() => onOpenCard(item)}>Xem toàn bộ thẻ kho →</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th className="ls-stt">STT</th><th>Ngày</th><th>Loại</th><th>Lô</th><th className="ls-num">Số lượng</th><th className="ls-num">Tồn</th><th>Số phiếu / người nhận</th></tr></thead>
                <tbody>
                  {(recent || []).map((r, idx) => {
                    const d = num(r.quantity_delta);
                    return (
                      <tr key={r.id}>
                        <td className="ls-stt">{idx + 1}</td>
                        <td>{r.movement_date}</td>
                        <td>{MOVEMENT_LABEL[r.movement_type]}{r.reason_code ? <span className="subline">{REASON_LABEL[r.reason_code] || r.reason_code}</span> : null}</td>
                        <td>{r.lot?.lot_number || "—"}</td>
                        <td className="ls-num">{d > 0 ? "+" : "−"}{formatQuantity(Math.abs(d))}</td>
                        <td className="ls-num"><strong>{formatQuantity(r.balance)}</strong></td>
                        <td>{[r.reference_no, r.counterparty].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    );
                  })}
                  {recent === null ? <tr><td colSpan={7}><div className="empty-state">Đang tải...</div></td></tr> : null}
                  {recent && !recent.length ? <tr><td colSpan={7}><div className="empty-state">Vật tư chưa có phiếu nào.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button tertiary" onClick={() => void printItemLabel(item).catch((e) => onError(e instanceof Error ? e.message : "Không in được tem."))}><Icon name="qr-code" size={17} /> In tem QR</button>
          {canManage ? (
            <>
              {expiredTotal > 0 ? <button type="button" className="button secondary" onClick={() => onIssue(item, "DISPOSAL", expiredTotal)}>Lập phiếu hủy lô hết hạn</button> : null}
              <button type="button" className="button secondary" disabled={total <= 0} onClick={() => onIssue(item)}>Xuất kho</button>
              <button type="button" className="button primary" onClick={() => onReceive(item)}><Icon name="plus" size={17} /> Nhập kho</button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
