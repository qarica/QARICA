"use client";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ADJUST_REASON_LABEL, fmtDate, formatQuantity, parseSignedQuantity } from "../lib/lab-supplies";
import { LabDateInput } from "./lab-supplies-date-input";
import { callApi, num, type Item, type Lot } from "./lab-supplies-types";

const REASONS = ["SHRINKAGE", "CORRECTION"] as const;

/**
 * ĐIỀU CHỈNH TỒN — sửa số tồn của MỘT lô ngoài đợt kiểm kê (hao hụt, đổ vỡ nhỏ, nhập/xuất sai số).
 * Sổ kho không sửa/xóa được, nên mọi sửa sai đều là một dòng điều chỉnh mới (+ tăng / − giảm) có lý do và ghi chú.
 */
export function LabAdjust({ lots, itemById, today, onDone, onError }: { lots: Lot[]; itemById: Map<string, Item>; today: string; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("SHRINKAGE");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => lots.map((lot) => ({ lot, item: itemById.get(lot.item_id) })).filter((r): r is { lot: Lot; item: Item } => !!r.item).sort((a, b) => a.item.code.localeCompare(b.item.code) || (a.lot.expiry_date || "9999").localeCompare(b.lot.expiry_date || "9999")),
    [lots, itemById],
  );
  const chosen = options.find((o) => o.lot.lot_id === lotId);
  const delta = parseSignedQuantity(quantity);
  const after = chosen && delta !== null ? num(chosen.lot.balance) + delta : null;
  const problem = !chosen ? "Chọn lô cần điều chỉnh." : delta === null ? "Nhập số lượng điều chỉnh khác 0 (VD: -2 để giảm, 3 để tăng)." : after !== null && after < 0 ? `Tồn lô chỉ còn ${formatQuantity(chosen.lot.balance)} ${chosen.item.unit}, không giảm quá số đó.` : note.trim().length < 3 ? "Ghi chú lý do chi tiết (ít nhất 3 ký tự)." : !date ? "Chọn ngày phiếu hợp lệ." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return onError(problem);
    setBusy(true);
    try {
      await callApi("/api/lab-supplies/movements", "POST", { movement_type: "ADJUST", lot_id: lotId, quantity, reason_code: reason, note, movement_date: date });
      setLotId("");
      setQuantity("");
      setNote("");
      setDate(today);
      onDone("Đã ghi phiếu điều chỉnh tồn.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không ghi được điều chỉnh.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title"><div><h2>2. Điều chỉnh tồn</h2><p>Sửa số tồn của một lô ngoài đợt kiểm kê: hao hụt, đổ vỡ nhỏ, hoặc số liệu nhập/xuất sai. Sổ không sửa được nên điều chỉnh luôn là một dòng mới (+ tăng / − giảm) kèm lý do.</p></div></div>
      <form className="ls-adjust-form" onSubmit={submit} aria-label="Phiếu điều chỉnh tồn">
        <div className="ls-head-grid">
          <label className="ls-span-2">Lô cần điều chỉnh *
            <select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lô cần điều chỉnh">
              <option value="">— Chọn vật tư / lô —</option>
              {options.map(({ lot, item }) => <option key={lot.lot_id} value={lot.lot_id}>{item.code} — {item.name} · Lô {lot.lot_number}{lot.expiry_date ? ` · HSD ${fmtDate(lot.expiry_date)}` : ""} · tồn {formatQuantity(lot.balance)} {item.unit}</option>)}
            </select>
          </label>
          <label>Số lượng điều chỉnh (+ tăng / − giảm) *<input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="VD: -2" aria-label="Số lượng điều chỉnh" /></label>
          <label>Lý do<select value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} aria-label="Lý do điều chỉnh">{REASONS.map((k) => <option key={k} value={k}>{ADJUST_REASON_LABEL[k]}</option>)}</select></label>
          <label>Ngày phiếu<LabDateInput label="Ngày điều chỉnh" max={today} value={date} onChange={setDate} /></label>
          <label className="ls-span-2">Ghi chú *<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Giải thích chi tiết (ít nhất 3 ký tự)" aria-label="Ghi chú điều chỉnh" /></label>
        </div>
        <div className="ls-bar ls-bar-end">
          <span className="muted tiny ls-grow" role="status">{[chosen && after !== null && after >= 0 ? `Tồn lô sau điều chỉnh: ${formatQuantity(after)} ${chosen.item.unit} (hiện ${formatQuantity(chosen.lot.balance)})` : "", problem && (lotId || quantity) ? problem : ""].filter(Boolean).join(" — ")}</span>
          <button className="button primary" disabled={busy || !!problem}><Icon name="save" size={17} />{busy ? "Đang ghi..." : "Ghi điều chỉnh"}</button>
        </div>
      </form>
    </section>
  );
}
