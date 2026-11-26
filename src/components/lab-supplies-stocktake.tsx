"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { STOCKTAKE_LARGE_DIFF_NOTE_MIN, STOCKTAKE_LARGE_DIFF_PCT, formatQuantity, isLargeStocktakeDiff } from "../lib/lab-supplies";
import { LabGuide, STOCKTAKE_GUIDE } from "./lab-supplies-guide";
import { callApi, num, type Closing, type Item, type Lot } from "./lab-supplies-types";

// KIỂM KÊ & CHỐT KỲ — việc làm định kỳ, nên gom 2 bước liền nhau trên một màn hình: (1) đếm thực tế → chênh lệch tự sinh
// phiếu điều chỉnh; (2) chốt kỳ (khóa không cho ghi lùi ngày). Đúng thứ tự thực tế: kiểm kê xong mới chốt.
export function LabStocktake({ lots, itemById, today, lastClosing, canManage, onDone, onError }: { lots: Lot[]; itemById: Map<string, Item>; today: string; lastClosing: Closing; canManage: boolean; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [closeDate, setCloseDate] = useState(today);
  const [closeNote, setCloseNote] = useState("");

  const rows = useMemo(
    () => lots.map((lot) => ({ lot, item: itemById.get(lot.item_id) })).filter((r): r is { lot: Lot; item: Item } => !!r.item).sort((a, b) => a.item.code.localeCompare(b.item.code) || (a.lot.expiry_date || "9999").localeCompare(b.lot.expiry_date || "9999")),
    [lots, itemById],
  );
  const filled = rows.filter((r) => (counts[r.lot.lot_id] ?? "").trim() !== "");
  const largeCount = filled.filter((r) => {
    const c = Number((counts[r.lot.lot_id] ?? "").replace(",", "."));
    return Number.isFinite(c) && isLargeStocktakeDiff(num(r.lot.balance), c);
  }).length;
  const needNote = largeCount > 0 && note.trim().length < STOCKTAKE_LARGE_DIFF_NOTE_MIN;

  async function submit() {
    if (!filled.length) return onError("Chưa nhập số đếm thực tế cho lô nào.");
    if (needNote) return onError(`Có ${largeCount} lô chênh lệch lớn (trên ${STOCKTAKE_LARGE_DIFF_PCT}%): hãy ghi chú giải thích trước khi ghi kiểm kê.`);
    if (!window.confirm(`Ghi kiểm kê ${filled.length} lô? Chênh lệch sẽ tự sinh phiếu điều chỉnh trong sổ.`)) return;
    setBusy(true);
    try {
      const json = await callApi("/api/lab-supplies/stocktakes", "POST", { note, lines: filled.map((r) => ({ lot_id: r.lot.lot_id, counted_quantity: counts[r.lot.lot_id] })) });
      setCounts({});
      setNote("");
      onDone(`Đã ghi kiểm kê ${json.result?.lines ?? filled.length} lô, ${json.result?.adjusted ?? 0} lô có chênh lệch đã được điều chỉnh.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không ghi được kiểm kê.");
    } finally {
      setBusy(false);
    }
  }

  async function reopenPeriod() {
    if (!lastClosing) return;
    const reason = window.prompt(`Mở lại kỳ đã chốt đến hết ngày ${lastClosing.period_end}?\nSau khi mở, kho ghi được phiếu có ngày trong kỳ này. Nhập lý do (bắt buộc, lưu vết):`);
    if (reason === null) return;
    if (reason.trim().length < 5) return onError("Mở lại kỳ phải ghi lý do (ít nhất 5 ký tự).");
    setBusy(true);
    try {
      await callApi("/api/lab-supplies/closings/reopen", "POST", { reason });
      onDone(`Đã mở lại kỳ đến ${lastClosing.period_end}. Lý do đã được lưu vết.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không mở lại được kỳ.");
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod() {
    if (!window.confirm(`Chốt kỳ đến hết ngày ${closeDate}? Sau khi chốt sẽ không ghi thêm phiếu có ngày ≤ ${closeDate}. Chốt nhầm thì dùng “Mở lại kỳ” (ghi lý do, có lưu vết).`)) return;
    setBusy(true);
    try {
      await callApi("/api/lab-supplies/closings", "POST", { period_end: closeDate, note: closeNote });
      setCloseNote("");
      onDone(`Đã chốt kỳ đến ${closeDate}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không chốt được kỳ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ls-stack">
      <LabGuide {...STOCKTAKE_GUIDE} defaultOpen />
      <section className="panel">
        <div className="panel-title"><div><h2>1. Kiểm kê</h2><p>Chỉ nhập số đếm cho các lô đã kiểm; lô để trống sẽ không tính. Số đếm bằng tồn sổ thì không phát sinh điều chỉnh.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="ls-stt">STT</th><th>Vật tư</th><th>Số lô</th><th>Hạn dùng</th><th className="ls-num">Tồn sổ</th><th className="ls-num">Số đếm thực tế</th><th className="ls-num">Chênh lệch</th></tr></thead>
            <tbody>
              {rows.map(({ lot, item }, idx) => {
                const raw = counts[lot.lot_id] ?? "";
                const counted = raw.trim() === "" ? null : Number(raw.replace(",", "."));
                const diff = counted !== null && Number.isFinite(counted) ? counted - num(lot.balance) : null;
                return (
                  <tr key={lot.lot_id}>
                    <td className="ls-stt">{idx + 1}</td>
                    <td><strong>{item.name}</strong><span className="subline">{item.code}</span></td>
                    <td>{lot.lot_number}</td>
                    <td>{lot.expiry_date || "—"}</td>
                    <td className="ls-num">{formatQuantity(lot.balance)} {item.unit}</td>
                    <td className="ls-num"><input className="ls-count-input" inputMode="decimal" value={raw} disabled={!canManage} aria-label={`Số đếm lô ${lot.lot_number} ${item.code}`} onChange={(e) => setCounts({ ...counts, [lot.lot_id]: e.target.value })} /></td>
                    <td className="ls-num">{diff === null ? "—" : <strong style={{ color: diff === 0 ? undefined : diff < 0 ? "#b91c1c" : "#b45309" }}>{diff > 0 ? "+" : ""}{formatQuantity(diff)}</strong>}{diff !== null && isLargeStocktakeDiff(num(lot.balance), counted as number) ? <span className="ls-diff-large" title={`Chênh lệch trên ${STOCKTAKE_LARGE_DIFF_PCT}% so với tồn sổ`}>Lệch lớn</span> : null}</td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={7}><div className="empty-state">Chưa có lô nào còn tồn để kiểm kê.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="ls-bar ls-bar-end">
            <input className={`ls-grow${needNote ? " ls-need-note" : ""}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={largeCount > 0 ? `Bắt buộc: giải thích ${largeCount} lô lệch lớn` : "Ghi chú phiếu kiểm kê (tùy chọn)"} aria-label="Ghi chú phiếu kiểm kê" />
            <button className="button primary" onClick={submit} disabled={busy || !filled.length}><Icon name="save" size={17} />{busy ? "Đang ghi..." : `Ghi kiểm kê (${filled.length} lô)`}</button>
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section className="panel">
          <div className="panel-title"><div><h2>2. Chốt kỳ</h2><p>{lastClosing ? `Kỳ chốt gần nhất: đến hết ngày ${lastClosing.period_end}.` : "Chưa chốt kỳ nào."} Chốt xong không ghi thêm phiếu có ngày trong kỳ. Chốt nhầm thì bấm “Mở lại kỳ” (chỉ kỳ gần nhất, ghi lý do, có lưu vết).</p></div></div>
          <div className="ls-bar ls-bar-end">
            <label>Chốt đến hết ngày<input type="date" value={closeDate} max={today} min={lastClosing ? lastClosing.period_end : undefined} onChange={(e) => setCloseDate(e.target.value)} /></label>
            <input className="ls-grow" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Ghi chú (VD: Chốt tháng 11/2026)" aria-label="Ghi chú chốt kỳ" />
            <button className="button secondary" onClick={closePeriod} disabled={busy}>Chốt kỳ</button>
            {lastClosing ? <button type="button" className="button secondary" onClick={reopenPeriod} disabled={busy} title="Chỉ mở lại được kỳ chốt gần nhất, bắt buộc ghi lý do">Mở lại kỳ {lastClosing.period_end}</button> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
