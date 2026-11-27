"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { LabItemCard } from "@/components/lab-supplies-item-card";
import { MOVEMENT_LABEL, REASON_LABEL, formatQuantity, type MovementType, type SupplyCategory, type SupplyKind, fmtDate } from "../lib/lab-supplies";
import { LabDateInput } from "./lab-supplies-date-input";
import { LEDGER_GUIDE, LabGuide } from "./lab-supplies-guide";
import { callApi, itemLabel, num, resolveItem, type Item, type Movement } from "./lab-supplies-types";

type ReportRow = { item_id: string; code: string; name: string; unit: string; category: SupplyCategory; is_active: boolean; min_stock: number; opening: number; receipts: number; issues: number; disposals: number; adjustments: number; closing: number };
type Sub = "ledger" | "card" | "report";

// SỔ KHO & BÁO CÁO = mọi thứ "xem lại lịch sử" ở MỘT chỗ, 3 góc nhìn trên cùng một sổ:
//   Phiếu (toàn bộ nhập/xuất theo thời gian) · Thẻ kho (lọc theo 1 vật tư, có tồn lũy kế) · Nhập–Xuất–Tồn theo kỳ.
export function LabLedger({ supplyKind, movements, items, today, search, cardItemId, cardKey }: { supplyKind: SupplyKind; movements: Movement[]; items: Item[]; today: string; search: string; cardItemId: string | null; cardKey: number }) {
  const [sub, setSub] = useState<Sub>("ledger");
  const [type, setType] = useState<"" | MovementType>("");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [cardText, setCardText] = useState("");
  const [cardItem, setCardItem] = useState<Item | null>(null);

  // Mở thẻ kho từ nơi khác (nút "Xem toàn bộ thẻ kho" ở chi tiết vật tư).
  useEffect(() => {
    if (!cardItemId) return;
    const it = items.find((i) => i.id === cardItemId);
    if (it) { setSub("card"); setCardItem(it); setCardText(itemLabel(it)); }
  }, [cardItemId, cardKey, items]);

  const q = search.trim().toLowerCase();
  const rows = movements.filter((m) => {
    if (type && m.movement_type !== type) return false;
    if (!q) return true;
    return [m.item?.code, m.item?.name, m.lot?.lot_number, m.reference_no, m.counterparty, m.note].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <section className="panel">
      <LabGuide {...LEDGER_GUIDE} defaultOpen />
      <div className="ls-bar">
        <div className="ls-seg" role="group" aria-label="Góc nhìn sổ kho">
          <button type="button" className={sub === "ledger" ? "active" : ""} aria-pressed={sub === "ledger"} onClick={() => setSub("ledger")}>Phiếu</button>
          <button type="button" className={sub === "card" ? "active" : ""} aria-pressed={sub === "card"} onClick={() => setSub("card")}>Thẻ kho vật tư</button>
          <button type="button" className={sub === "report" ? "active" : ""} aria-pressed={sub === "report"} onClick={() => setSub("report")}>Nhập–Xuất–Tồn theo kỳ</button>
        </div>
      </div>

      {sub === "ledger" ? (
        <>
          <div className="ls-bar">
            <select value={type} onChange={(e) => setType(e.target.value as "" | MovementType)} aria-label="Lọc loại phiếu">
              <option value="">Tất cả loại phiếu</option>
              {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
            </select>
            <span className="ls-grow" />
            <label className="inline-check">Từ <LabDateInput label="Xuất từ ngày" max={today} value={from} onChange={setFrom} /></label>
            <label className="inline-check">đến <LabDateInput label="Xuất đến ngày" max={today} value={to} onChange={setTo} /></label>
            <a className="button secondary" href={`/api/lab-supplies/export?type=ledger&from=${from}&to=${to}&kind=${supplyKind}`} download><Icon name="download" size={16} /> Xuất Excel</a>
          </div>
          <p className="muted tiny ls-note">Hiển thị 300 phiếu gần nhất (Xuất Excel lấy đủ theo khoảng ngày). Sổ không sửa/xóa được — sai sót sửa bằng phiếu điều chỉnh ở chi tiết vật tư.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="ls-stt">STT</th><th>Ngày</th><th>Loại</th><th>Vật tư</th><th>Lô</th><th className="ls-num">Số lượng</th><th>Số phiếu / người nhận</th><th>Lý do / ghi chú</th><th>Người ghi</th></tr></thead>
              <tbody>
                {rows.map((m, idx) => {
                  const d = num(m.quantity_delta);
                  return (
                    <tr key={m.id}>
                      <td className="ls-stt">{idx + 1}</td>
                      <td>{fmtDate(m.movement_date)}</td>
                      <td>{MOVEMENT_LABEL[m.movement_type]}</td>
                      <td><strong>{m.item?.name}</strong><span className="subline">{m.item?.code}</span></td>
                      <td>{m.lot?.lot_number || "—"}{m.lot?.expiry_date ? <span className="subline">HSD {fmtDate(m.lot.expiry_date)}</span> : null}</td>
                      <td className="ls-num"><strong style={{ color: d < 0 ? "#b45309" : "#15803d" }}>{d > 0 ? "+" : "−"}{formatQuantity(Math.abs(d))}</strong> {m.item?.unit}</td>
                      <td>{[m.reference_no, m.counterparty].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{[m.reason_code ? REASON_LABEL[m.reason_code] || m.reason_code : "", m.note].filter(Boolean).join(" — ") || "—"}</td>
                      <td>{m.actor_name || "—"}</td>
                    </tr>
                  );
                })}
                {!rows.length ? <tr><td colSpan={9}><div className="empty-state">Chưa có phiếu nào.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {sub === "card" ? (
        <div className="ls-form-pad">
          <datalist id="ls-card-items">{items.map((i) => <option key={i.id} value={itemLabel(i)} />)}</datalist>
          <label>Chọn vật tư để xem thẻ kho
            <input list="ls-card-items" value={cardText} onChange={(e) => { setCardText(e.target.value); setCardItem(resolveItem(items, e.target.value)); }} placeholder="Gõ mã hoặc tên vật tư…" autoComplete="off" />
          </label>
          {cardItem ? <LabItemCard item={cardItem} /> : <div className="empty-state">Chọn một vật tư để xem toàn bộ lịch sử nhập–xuất và tồn lũy kế.</div>}
        </div>
      ) : null}

      {sub === "report" ? <ReportView today={today} supplyKind={supplyKind} /> : null}
    </section>
  );
}

function ReportView({ today, supplyKind }: { today: string; supplyKind: SupplyKind }) {
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const json = await callApi(`/api/lab-supplies/report?from=${from}&to=${to}&kind=${supplyKind}`, "GET");
      setRows(json.rows as ReportRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo.");
    } finally {
      setBusy(false);
    }
  }
  const visible = (rows || []).filter((r) => r.is_active || [r.opening, r.receipts, r.issues, r.disposals, r.adjustments, r.closing].some((v) => v !== 0));

  return (
    <>
      <div className="ls-bar">
        <label className="inline-check">Từ ngày <LabDateInput label="Báo cáo từ ngày" value={from} max={to} onChange={setFrom} /></label>
        <label className="inline-check">Đến ngày <LabDateInput label="Báo cáo đến ngày" value={to} min={from} max={today} onChange={setTo} /></label>
        <button className="button primary" onClick={load} disabled={busy}><Icon name="refresh-cw" size={16} /> Xem báo cáo</button>
        <span className="ls-grow" />
        <Link className="button secondary" href={`/api/lab-supplies/report?from=${from}&to=${to}&format=xlsx&kind=${supplyKind}`}><Icon name="download" size={16} /> Xuất Excel</Link>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th className="ls-stt">STT</th><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th className="ls-num">Tồn đầu kỳ</th><th className="ls-num">Nhập</th><th className="ls-num">Xuất dùng</th><th className="ls-num">Hủy</th><th className="ls-num">Điều chỉnh</th><th className="ls-num">Tồn cuối kỳ</th></tr></thead>
          <tbody>
            {visible.map((r, idx) => (
              <tr key={r.item_id}>
                <td className="ls-stt">{idx + 1}</td>
                <td><code className="code-pill">{r.code}</code></td><td><strong>{r.name}</strong></td><td>{r.unit}</td>
                <td className="ls-num">{formatQuantity(r.opening)}</td><td className="ls-num">{formatQuantity(r.receipts)}</td><td className="ls-num">{formatQuantity(r.issues)}</td>
                <td className="ls-num">{formatQuantity(r.disposals)}</td><td className="ls-num">{formatQuantity(r.adjustments)}</td><td className="ls-num"><strong>{formatQuantity(r.closing)}</strong></td>
              </tr>
            ))}
            {rows === null ? <tr><td colSpan={10}><div className="empty-state">Chọn khoảng ngày rồi bấm “Xem báo cáo”.</div></td></tr> : null}
            {rows !== null && !visible.length ? <tr><td colSpan={10}><div className="empty-state">Không có số liệu trong kỳ.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="muted tiny ls-note">Tồn đầu kỳ = tổng sổ trước ngày bắt đầu; tồn cuối = tổng sổ đến hết ngày kết thúc. Không có số tồn nhập tay nên báo cáo luôn khớp sổ.</p>
    </>
  );
}
