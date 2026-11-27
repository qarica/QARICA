"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import {
  DISPOSAL_REASON_LABEL,
  EXPIRY_REQUIRED_CATEGORIES,
  MOVEMENT_LABEL,
  allocateFefo,
  formatQuantity,
  lotExpiryStatus,
  parsePositiveQuantity,
  sortLotsFefo,
  fmtDate,
  type Allocation,
} from "../lib/lab-supplies";
import { LabDateInput } from "./lab-supplies-date-input";
import { ISSUE_GUIDE, LabGuide, RECEIPT_GUIDE } from "./lab-supplies-guide";
import { callApi, itemLabel, num, resolveItem, type Item, type Lot, type Movement } from "./lab-supplies-types";

// MỘT phiếu = MỘT màn hình cho cả nhập và xuất (xuất dùng / hủy hàng):
//  • Nhập: chọn/quét vật tư → số lô → hạn dùng → số lượng. 
//  • Xuất: chỉ chọn vật tư + số lượng; hệ thống TỰ phân bổ qua các lô theo FEFO (hạn dùng gần nhất trước) và hiện rõ
//    "lấy từ lô nào bao nhiêu"; vẫn có thể "Đổi lô" bằng tay. Hủy hàng ưu tiên lô đã hết hạn.
// Ghi qua /api/lab-supplies/movements/batch: cả phiếu trong MỘT giao dịch, 1 dòng lỗi => không ghi gì.
export type VoucherIncoming = { itemId: string; quantity?: number; mode?: "ISSUE" | "DISPOSAL"; key: number; target: "RECEIPT" | "ISSUE" } | null;
type Line = { key: number; text: string; quantity: string; lot_number: string; expiry_date: string; manualLot: string };
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, text: "", quantity: "", lot_number: "", expiry_date: "", manualLot: "" });

const PARTY_KEY = (k: string) => `lab-supplies:last-party:${k}`;
function readParty(kind: string): string {
  try { return window.localStorage.getItem(PARTY_KEY(kind)) || ""; } catch { return ""; }
}
function writeParty(kind: string, value: string) {
  try { if (value.trim()) window.localStorage.setItem(PARTY_KEY(kind), value.trim()); } catch { /* không có localStorage — bỏ qua */ }
}

export function LabVoucher({ kind, items, lots, movements, today, incoming, onConsumed, onDone }: { kind: "RECEIPT" | "ISSUE"; items: Item[]; lots: Lot[]; movements: Movement[]; today: string; incoming: VoucherIncoming; onConsumed: () => void; onDone: (text: string) => void }) {
  const [mode, setMode] = useState<"ISSUE" | "DISPOSAL">("ISSUE");
  const type = kind === "RECEIPT" ? "RECEIPT" : mode;
  const [movementDate, setMovementDate] = useState(today);
  const [referenceNo, setReferenceNo] = useState("");
  const [party, setParty] = useState("");
  const [reasonCode, setReasonCode] = useState("DAMAGED");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listId = `ls-items-${kind}`;

  // Nhà cung cấp / người nhận lần trước được nhớ lại để khỏi gõ lại.
  useEffect(() => {
    setParty(readParty(type === "RECEIPT" ? "RECEIPT" : "ISSUE"));
  }, [type]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lots) m.set(l.item_id, (m.get(l.item_id) || 0) + num(l.balance));
    return m;
  }, [lots]);
  const selectable = useMemo(() => (kind === "RECEIPT" ? items.filter((i) => i.is_active) : items.filter((i) => (totals.get(i.id) || 0) > 0)), [items, kind, totals]);
  const lotsByItem = useMemo(() => {
    const m = new Map<string, Lot[]>();
    for (const l of lots) m.set(l.item_id, [...(m.get(l.item_id) || []), l]);
    return m;
  }, [lots]);

  // Quét mã / bấm "Nhập"/"Xuất" từ nơi khác → thêm dòng cho vật tư đó.
  const seen = useRef(0);
  useEffect(() => {
    // Chỉ nhận yêu cầu dành cho đúng loại phiếu này, và chỉ dùng MỘT lần (báo lại cho vỏ trang xóa đi) — tránh việc quét ở
    // tab Nhập kho rồi chuyển sang Xuất kho lại tự thêm dòng.
    if (!incoming || incoming.target !== kind || incoming.key === seen.current) return;
    seen.current = incoming.key;
    onConsumed();
    const item = items.find((i) => i.id === incoming.itemId);
    if (!item) return;
    if (kind === "ISSUE" && incoming.mode) setMode(incoming.mode);
    setLines((prev) => {
      const text = itemLabel(item);
      const emptyIdx = prev.findIndex((l) => !l.text.trim());
      const patch: Partial<Line> = { text, quantity: incoming.quantity ? String(incoming.quantity) : "" };
      if (emptyIdx >= 0) return prev.map((l, i) => (i === emptyIdx ? { ...l, ...patch } : l));
      return [...prev, { ...emptyLine(), ...patch }];
    });
  }, [incoming, items, kind, onConsumed]);

  const update = (key: number, patch: Partial<Line>) => setLines((v) => v.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const focusLine = (key: number) => setTimeout(() => (document.querySelector(`[data-line="${key}"] input`) as HTMLInputElement | null)?.focus(), 30);
  function addLine(copyFrom?: Line) {
    const l = { ...emptyLine(), ...(copyFrom ? { text: copyFrom.text, lot_number: "", expiry_date: copyFrom.expiry_date } : {}) };
    setLines((v) => (v.length >= 100 ? v : [...v, l]));
    focusLine(l.key);
  }

  // Xem trước phân bổ lô cho phiếu xuất (tuần tự để 2 dòng cùng vật tư không dùng trùng tồn).
  const views = useMemo(() => {
    const used: Record<string, number> = {};
    return lines.map((l) => {
      const item = resolveItem(items, l.text);
      const qty = parsePositiveQuantity(l.quantity);
      if (kind !== "ISSUE" || !item || qty === null) return { item, qty, allocations: [] as Allocation[], shortage: 0, manual: false, older: null as { lot_number: string; expiry_date: string | null } | null };
      const itemLots = (lotsByItem.get(item.id) || []).map((x) => ({ lot_id: x.lot_id, lot_number: x.lot_number, expiry_date: x.expiry_date, balance: num(x.balance) }));
      let result;
      // Cảnh báo (không chặn): thủ kho chọn tay một lô trong khi còn lô khác hết hạn sớm hơn.
      let older: { lot_number: string; expiry_date: string | null } | null = null;
      if (l.manualLot && mode === "ISSUE") {
        const eligible = sortLotsFefo(itemLots.filter((x) => x.balance - (used[x.lot_id] || 0) > 0 && lotExpiryStatus(x.expiry_date, item.expiry_warning_days, today) !== "EXPIRED"));
        const first = eligible[0];
        if (first && first.lot_id !== l.manualLot) older = { lot_number: first.lot_number, expiry_date: first.expiry_date };
      }
      if (l.manualLot) {
        const lot = itemLots.find((x) => x.lot_id === l.manualLot);
        const avail = lot ? Math.max(0, num(lot.balance) - (used[lot.lot_id] || 0)) : 0;
        const take = Math.min(avail, qty);
        result = { allocations: lot && take > 0 ? [{ lot_id: lot.lot_id, lot_number: lot.lot_number, expiry_date: lot.expiry_date, quantity: take }] : [], shortage: Math.max(0, Math.round((qty - take) * 1000) / 1000) };
      } else result = allocateFefo(itemLots, qty, mode, today, used);
      for (const a of result.allocations) used[a.lot_id] = (used[a.lot_id] || 0) + a.quantity;
      return { item, qty, ...result, manual: !!l.manualLot, older };
    });
  }, [lines, items, kind, mode, today, lotsByItem]);

  const filled = lines.map((l, i) => ({ l, v: views[i] })).filter((x) => x.l.text.trim() || x.l.quantity.trim());
  const problems: string[] = [];
  filled.forEach(({ l, v }, i) => {
    const n = i + 1;
    if (!v.item) problems.push(`Dòng ${n}: chưa chọn vật tư (chọn từ gợi ý hoặc quét mã)`);
    else if (v.qty === null) problems.push(`Dòng ${n}: số lượng phải là số lớn hơn 0`);
    else if (kind === "RECEIPT") {
      if (!l.lot_number.trim()) problems.push(`Dòng ${n}: nhập số lô`);
      if (!l.expiry_date && EXPIRY_REQUIRED_CATEGORIES.includes(v.item.category)) problems.push(`Dòng ${n}: ${v.item.name} bắt buộc có hạn dùng`);
    } else if (v.shortage > 0) problems.push(`Dòng ${n}: ${v.item.name} chỉ còn ${formatQuantity(v.qty - v.shortage)} ${v.item.unit} có thể ${mode === "ISSUE" ? "xuất" : "hủy"}`);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!filled.length) return setError("Phiếu chưa có dòng nào.");
    if (problems.length) return setError(problems[0]);
    if (type === "ISSUE" && party.trim().length < 2) return setError("Xuất dùng phải ghi người nhận / nơi sử dụng.");
    if (type === "DISPOSAL" && note.trim().length < 3) return setError("Hủy hàng phải ghi chú lý do chi tiết (tối thiểu 3 ký tự).");
    setBusy(true);
    try {
      const payloadLines =
        kind === "RECEIPT"
          ? filled.map(({ l, v }) => ({ item_id: v.item!.id, lot_number: l.lot_number.trim(), expiry_date: l.expiry_date, quantity: l.quantity }))
          : filled.flatMap(({ v }) => v.allocations.map((a) => ({ lot_id: a.lot_id, quantity: String(a.quantity) })));
      const json = await callApi("/api/lab-supplies/movements/batch", "POST", {
        movement_type: type, movement_date: movementDate, reference_no: referenceNo, counterparty: party, note,
        reason_code: type === "DISPOSAL" ? reasonCode : undefined, lines: payloadLines,
      });
      writeParty(type === "RECEIPT" ? "RECEIPT" : "ISSUE", party);
      setLines([emptyLine()]);
      setReferenceNo("");
      setNote("");
      const written = json.result?.lines ?? payloadLines.length;
      onDone(`Đã ghi phiếu ${MOVEMENT_LABEL[type].toLowerCase()} — ${filled.length} dòng${written !== filled.length ? ` (${written} lô ghi sổ)` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  const recent = movements.filter((m) => (kind === "RECEIPT" ? m.movement_type === "RECEIPT" : m.movement_type === "ISSUE" || m.movement_type === "DISPOSAL")).slice(0, 6);
  const partyLabel = type === "RECEIPT" ? "Nhà cung cấp" : type === "ISSUE" ? "Người nhận / nơi sử dụng *" : "Người hủy / hội đồng";

  return (
    <form className="ls-voucher" onSubmit={submit} aria-label={kind === "RECEIPT" ? "Phiếu nhập kho" : "Phiếu xuất kho"}>
      <LabGuide {...(kind === "RECEIPT" ? RECEIPT_GUIDE : ISSUE_GUIDE)} />
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{kind === "RECEIPT" ? "Phiếu nhập kho" : type === "ISSUE" ? "Phiếu xuất dùng" : "Phiếu hủy hàng"}</h2>
            <p>{kind === "RECEIPT" ? "Hàng về: quét mã hoặc chọn vật tư, ghi số lô, hạn dùng và số lượng. Một phiếu nhiều dòng." : "Chỉ cần chọn vật tư và số lượng — hệ thống tự lấy từ lô có hạn dùng gần nhất trước."}</p>
          </div>
          {kind === "ISSUE" ? (
            <div className="ls-seg" role="group" aria-label="Loại phiếu xuất">
              <button type="button" className={mode === "ISSUE" ? "active" : ""} aria-pressed={mode === "ISSUE"} onClick={() => setMode("ISSUE")}>Xuất dùng</button>
              <button type="button" className={mode === "DISPOSAL" ? "active" : ""} aria-pressed={mode === "DISPOSAL"} onClick={() => setMode("DISPOSAL")}>Hủy hàng</button>
            </div>
          ) : null}
        </div>
        <div className="ls-form-pad">
          {error ? <div className="alert error">{error}</div> : null}
          <div className="ls-head-grid">
            <label>Ngày phiếu<LabDateInput label="Ngày phiếu" max={today} value={movementDate} onChange={setMovementDate} /></label>
            <label>Số phiếu / chứng từ<input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={kind === "RECEIPT" ? "VD: PN-2026-015" : "VD: PX-2026-021"} /></label>
            <label>{partyLabel}<input value={party} onChange={(e) => setParty(e.target.value)} placeholder={kind === "RECEIPT" ? "Tên nhà cung cấp" : type === "ISSUE" ? "VD: Phòng XN Huyết học" : ""} /></label>
            {type === "DISPOSAL" ? (
              <label>Lý do hủy *<select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{Object.entries(DISPOSAL_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            ) : null}
            <label className={type === "DISPOSAL" ? "ls-span-3" : "ls-span-2"}>{type === "DISPOSAL" ? "Ghi chú lý do chi tiết *" : "Ghi chú chung"}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "DISPOSAL" ? "VD: Hết hạn ngày 20/11, hủy theo biên bản" : "Tuỳ chọn"} /></label>
          </div>

          <datalist id={listId}>{selectable.map((i) => <option key={i.id} value={itemLabel(i)} />)}</datalist>
          <div className={`ls-lines ${kind === "RECEIPT" ? "receipt" : "issue"}`}>
            <div className="ls-lines-head" aria-hidden>
              <span>STT</span><span>Vật tư</span>
              {kind === "RECEIPT" ? <><span>Số lô</span><span>Hạn dùng</span></> : null}
              <span>Số lượng</span>{kind === "ISSUE" ? <span>Lấy từ lô</span> : null}<span />
            </div>
            {lines.map((l, idx) => {
              const v = views[idx];
              const item = v.item;
              return (
                <div className="ls-line" key={l.key} data-line={l.key}>
                  <span className="ls-line-no">{idx + 1}</span>
                  <label className="ls-f"><span>Vật tư</span><input list={listId} value={l.text} onChange={(e) => update(l.key, { text: e.target.value, manualLot: "" })} placeholder="Gõ mã/tên hoặc quét mã…" autoComplete="off" aria-label={`Dòng ${idx + 1}: vật tư`} /></label>
                  {kind === "RECEIPT" ? (
                    <>
                      <label className="ls-f"><span>Số lô</span><input value={l.lot_number} onChange={(e) => update(l.key, { lot_number: e.target.value })} placeholder="Số lô" aria-label={`Dòng ${idx + 1}: số lô`} /></label>
                      <label className="ls-f"><span>Hạn dùng{item && EXPIRY_REQUIRED_CATEGORIES.includes(item.category) ? " *" : ""}</span><LabDateInput label={`Dòng ${idx + 1}: hạn dùng`} value={l.expiry_date} onChange={(iso) => update(l.key, { expiry_date: iso })} /></label>
                    </>
                  ) : null}
                  <label className="ls-f ls-qty"><span>Số lượng{item ? ` (${item.unit})` : ""}</span>
                    <input inputMode="decimal" value={l.quantity} placeholder="0" aria-label={`Dòng ${idx + 1}: số lượng`} onChange={(e) => update(l.key, { quantity: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }} />
                    {item ? <em>{item.unit}</em> : null}
                  </label>
                  {kind === "ISSUE" ? (
                    <div className="ls-alloc" aria-label={`Dòng ${idx + 1}: phân bổ lô`}>
                      {!item ? <span className="muted">—</span> : v.qty === null ? <span className="muted">Nhập số lượng để xem lô sẽ lấy</span> : (
                        <>
                          {v.allocations.map((a) => {
                            const st = lotExpiryStatus(a.expiry_date, item.expiry_warning_days, today);
                            return <span key={a.lot_id} className={`ls-chip ${st === "EXPIRED" ? "danger" : st === "EXPIRING" ? "warning" : ""}`}>Lô {a.lot_number}{a.expiry_date ? ` · HSD ${fmtDate(a.expiry_date)}` : ""} × {formatQuantity(a.quantity)}</span>;
                          })}
                          {v.older ? <span className="ls-fefo-warn" role="status">⚠ Không theo FEFO: còn lô {v.older.lot_number}{v.older.expiry_date ? ` (HSD ${fmtDate(v.older.expiry_date)})` : ""} hết hạn sớm hơn. Vẫn ghi được — chỉ nên chọn tay khi thực tế đã lấy lô này.</span> : null}
                          {v.shortage > 0 ? <span className="ls-chip danger">Thiếu {formatQuantity(v.shortage)} {item.unit}</span> : null}
                          <select aria-label={`Dòng ${idx + 1}: đổi lô`} value={l.manualLot} onChange={(e) => update(l.key, { manualLot: e.target.value })}>
                            <option value="">Tự động (hạn gần nhất trước)</option>
                            {sortLotsFefo(lotsByItem.get(item.id) || []).filter((x) => num(x.balance) > 0 && (mode === "DISPOSAL" || lotExpiryStatus(x.expiry_date, item.expiry_warning_days, today) !== "EXPIRED")).map((x) => <option key={x.lot_id} value={x.lot_id}>Lô {x.lot_number} · tồn {formatQuantity(x.balance)}{x.expiry_date ? ` · HSD ${fmtDate(x.expiry_date)}` : ""}</option>)}
                          </select>
                        </>
                      )}
                    </div>
                  ) : null}
                  <span className="ls-line-actions">
                    {kind === "RECEIPT" ? <button type="button" className="icon-button" title="Nhân đôi dòng (cùng vật tư, lô khác)" aria-label={`Nhân đôi dòng ${idx + 1}`} onClick={() => addLine(l)}><Icon name="plus" size={16} /></button> : null}
                    <button type="button" className="icon-button" title="Xóa dòng" aria-label={`Xóa dòng ${idx + 1}`} onClick={() => setLines((v2) => (v2.length > 1 ? v2.filter((x) => x.key !== l.key) : [emptyLine()]))}><Icon name="x" size={16} /></button>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ls-voucher-foot">
            <button type="button" className="button tertiary small" onClick={() => addLine()}><Icon name="plus" size={15} /> Thêm dòng</button>
            <span className="muted tiny">{filled.length} dòng{kind === "ISSUE" ? ` · sẽ ghi ${filled.reduce((s, x) => s + x.v.allocations.length, 0)} lô` : ""} · Enter ở ô số lượng để thêm dòng · 1 dòng lỗi thì cả phiếu không được ghi</span>
            <button className="button primary" disabled={busy || !filled.length}><Icon name="save" size={17} />{busy ? "Đang ghi..." : type === "RECEIPT" ? "Ghi phiếu nhập" : type === "ISSUE" ? "Ghi phiếu xuất" : "Ghi phiếu hủy"}</button>
          </div>
          {problems.length && filled.length ? <ul className="ls-problems">{problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Phiếu {kind === "RECEIPT" ? "nhập" : "xuất / hủy"} gần đây</h2><p>Để đối chiếu nhanh; xem đầy đủ ở tab “Sổ kho & báo cáo”.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="ls-stt">STT</th><th>Ngày</th><th>Loại</th><th>Vật tư</th><th>Lô</th><th className="ls-num">Số lượng</th><th>Số phiếu / {kind === "RECEIPT" ? "NCC" : "người nhận"}</th></tr></thead>
            <tbody>
              {recent.map((m, idx) => (
                <tr key={m.id}>
                  <td className="ls-stt">{idx + 1}</td>
                  <td>{fmtDate(m.movement_date)}</td><td>{MOVEMENT_LABEL[m.movement_type]}</td>
                  <td><strong>{m.item?.name}</strong><span className="subline">{m.item?.code}</span></td>
                  <td>{m.lot?.lot_number || "—"}</td>
                  <td className="ls-num">{formatQuantity(Math.abs(num(m.quantity_delta)))} {m.item?.unit}</td>
                  <td>{[m.reference_no, m.counterparty].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
              {!recent.length ? <tr><td colSpan={7}><div className="empty-state">Chưa có phiếu nào.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </form>
  );
}
