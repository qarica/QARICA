"use client";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { DISPOSAL_REASON_LABEL, EXPIRY_REQUIRED_CATEGORIES, formatQuantity, lotExpiryStatus, sortLotsFefo, type SupplyCategory } from "../lib/lab-supplies";

type BatchItem = { id: string; code: string; name: string; unit: string; category: SupplyCategory; is_active: boolean; expiry_warning_days: number };
type BatchLot = { lot_id: string; item_id: string; lot_number: string; expiry_date: string | null; balance: number | string };
export type BatchType = "RECEIPT" | "ISSUE" | "DISPOSAL";
type Line = { key: number; item_id: string; lot_id: string; lot_number: string; expiry_date: string; quantity: string };

const TITLE: Record<BatchType, string> = { RECEIPT: "Phiếu nhập kho nhiều dòng", ISSUE: "Phiếu xuất dùng nhiều dòng", DISPOSAL: "Phiếu hủy hàng nhiều dòng" };
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, item_id: "", lot_id: "", lot_number: "", expiry_date: "", quantity: "" });

// Phiếu nhiều dòng: 1 lần giao hàng 10–30 loại không phải nhập từng dòng. Ghi trong MỘT giao dịch: 1 dòng lỗi => cả phiếu
// không được ghi (báo rõ "Dòng N: ..."), vì sổ kho bất biến.
export function LabBatchDialog({ items, lots, today, initialType, onClose, onSaved }: { items: BatchItem[]; lots: BatchLot[]; today: string; initialType: BatchType; onClose: () => void; onSaved: (message: string) => void }) {
  const [type, setType] = useState<BatchType>(initialType);
  const [movementDate, setMovementDate] = useState(today);
  const [referenceNo, setReferenceNo] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [reasonCode, setReasonCode] = useState("DAMAGED");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lotOptions = useMemo(() => {
    return sortLotsFefo(lots.filter((l) => Number(l.balance) > 0).map((l) => ({ ...l, expiry_date: l.expiry_date, lot_number: l.lot_number })))
      .map((l) => {
        const item = itemById.get(l.item_id);
        const expired = item ? lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today) === "EXPIRED" : false;
        return { lot: l, item, expired, label: `${item?.code ?? "?"} — ${item?.name ?? ""} · lô ${l.lot_number} · tồn ${formatQuantity(l.balance)} ${item?.unit ?? ""}${l.expiry_date ? ` · HSD ${l.expiry_date}` : ""}${expired ? " (hết hạn)" : ""}` };
      })
      .sort((a, b) => (a.item?.code ?? "").localeCompare(b.item?.code ?? ""));
  }, [lots, itemById, today]);

  const update = (key: number, patch: Partial<Line>) => setLines((v) => v.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const activeItems = items.filter((i) => i.is_active);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const filled = lines.filter((l) => l.item_id || l.lot_id || l.lot_number || l.quantity);
    if (!filled.length) return setError("Phiếu chưa có dòng nào — chọn vật tư/lô và nhập số lượng.");
    setBusy(true);
    setError("");
    try {
      const payload = {
        movement_type: type, movement_date: movementDate, reference_no: referenceNo, counterparty, note,
        reason_code: type === "DISPOSAL" ? reasonCode : undefined,
        lines: filled.map((l) => (type === "RECEIPT" ? { item_id: l.item_id, lot_number: l.lot_number, expiry_date: l.expiry_date, quantity: l.quantity } : { lot_id: l.lot_id, quantity: l.quantity })),
      };
      const res = await fetch("/api/lab-supplies/movements/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không ghi được phiếu.");
      onSaved(`Đã ghi ${json.result?.lines ?? filled.length} dòng.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card xl" onSubmit={submit} aria-label={TITLE[type]}>
        <div className="modal-head">
          <div><div className="eyebrow">PHIẾU KHO</div><h2>{TITLE[type]}</h2></div>
          <button type="button" className="icon-button" onClick={() => !busy && onClose()} aria-label="Đóng"><Icon name="x" /></button>
        </div>
        <div className="modal-body form-stack">
          {error ? <div className="alert error">{error}</div> : null}
          <div className="form-grid two">
            <label>Loại phiếu
              <select value={type} onChange={(e) => { setType(e.target.value as BatchType); setLines([emptyLine(), emptyLine(), emptyLine()]); }}>
                <option value="RECEIPT">Nhập kho</option><option value="ISSUE">Xuất dùng</option><option value="DISPOSAL">Hủy hàng</option>
              </select>
            </label>
            <label>Ngày phiếu<input type="date" max={today} value={movementDate} onChange={(e) => setMovementDate(e.target.value)} /></label>
            <label>Số phiếu / số chứng từ<input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="VD: PN-2026-015" /></label>
            <label>{type === "RECEIPT" ? "Nhà cung cấp" : type === "ISSUE" ? "Người nhận / nơi sử dụng *" : "Người hủy / hội đồng"}<input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></label>
            {type === "DISPOSAL" ? (
              <label>Lý do hủy *<select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{Object.entries(DISPOSAL_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            ) : null}
            <label className={type === "DISPOSAL" ? "" : "span-2"}>Ghi chú chung{type === "DISPOSAL" ? " *" : ""}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "DISPOSAL" ? "Lý do chi tiết (tối thiểu 3 ký tự)" : "Tuỳ chọn"} /></label>
          </div>

          <div className="ls-batch-lines">
            {lines.map((l, idx) => {
              const item = itemById.get(l.item_id);
              const needsExpiry = item ? EXPIRY_REQUIRED_CATEGORIES.includes(item.category) : false;
              return (
                <div className="ls-batch-line" key={l.key}>
                  <span className="ls-batch-no">{idx + 1}</span>
                  {type === "RECEIPT" ? (
                    <>
                      <select aria-label={`Dòng ${idx + 1}: vật tư`} value={l.item_id} onChange={(e) => update(l.key, { item_id: e.target.value })}>
                        <option value="">— Chọn vật tư —</option>
                        {activeItems.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} ({i.unit})</option>)}
                      </select>
                      <input aria-label={`Dòng ${idx + 1}: số lô`} placeholder="Số lô" value={l.lot_number} onChange={(e) => update(l.key, { lot_number: e.target.value })} />
                      <input aria-label={`Dòng ${idx + 1}: hạn dùng`} type="date" title={needsExpiry ? "Bắt buộc với hóa chất/chất chuẩn" : "Hạn dùng (nếu có)"} value={l.expiry_date} onChange={(e) => update(l.key, { expiry_date: e.target.value })} />
                    </>
                  ) : (
                    <select className="ls-batch-lot" aria-label={`Dòng ${idx + 1}: lô`} value={l.lot_id} onChange={(e) => update(l.key, { lot_id: e.target.value })}>
                      <option value="">— Chọn lô —</option>
                      {lotOptions.map((o) => <option key={o.lot.lot_id} value={o.lot.lot_id} disabled={type === "ISSUE" && o.expired}>{o.label}</option>)}
                    </select>
                  )}
                  <input aria-label={`Dòng ${idx + 1}: số lượng`} inputMode="decimal" placeholder="Số lượng" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                  <button type="button" className="icon-button" aria-label={`Xóa dòng ${idx + 1}`} onClick={() => setLines((v) => (v.length > 1 ? v.filter((x) => x.key !== l.key) : v))}><Icon name="x" size={16} /></button>
                </div>
              );
            })}
          </div>
          <div>
            <button type="button" className="button tertiary small" onClick={() => setLines((v) => (v.length >= 100 ? v : [...v, emptyLine()]))}><Icon name="plus" size={15} /> Thêm dòng</button>
            <span className="muted tiny" style={{ marginLeft: 10 }}>Tối đa 100 dòng. Có 1 dòng lỗi thì cả phiếu không được ghi.</span>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang ghi..." : "Ghi phiếu"}</button>
        </div>
      </form>
    </div>
  );
}
