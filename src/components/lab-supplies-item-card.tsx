"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { MOVEMENT_LABEL, REASON_LABEL, formatQuantity, type MovementType, fmtDate } from "../lib/lab-supplies";
import { printItemCard } from "../lib/lab-supplies-label";

type CardRow = { id: string; movement_date: string; movement_type: MovementType; quantity_delta: number | string; reference_no: string | null; counterparty: string | null; reason_code: string | null; note: string | null; lot: { lot_number: string; expiry_date: string | null } | null; balance: number };

// Thẻ kho của 1 vật tư: toàn bộ nhập–xuất theo thời gian + tồn lũy kế (server tính từ sổ). Xuất Excel / in được.
export function LabItemCard({ item }: { item: { id: string; code: string; name: string; unit: string; barcode: string | null } }) {
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    fetch(`/api/lab-supplies/items/${item.id}/card`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Không tải được thẻ kho.");
        if (!cancelled) { setRows(json.rows); setTruncated(!!json.truncated); }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Không tải được thẻ kho."));
    return () => { cancelled = true; };
  }, [item.id]);

  return (
    <section className="ls-card">
      <div className="ls-card-head">
        <strong>Thẻ kho — lịch sử nhập · xuất</strong>
        <span className="ls-row-actions">
          <a className="button tertiary small" href={`/api/lab-supplies/items/${item.id}/card?format=xlsx`} download><Icon name="download" size={15} /> Xuất Excel</a>
          <button type="button" className="button tertiary small" disabled={!rows} onClick={() => rows && printItemCard(item, rows)}>In thẻ kho</button>
        </span>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {rows === null && !error ? <p className="muted tiny">Đang tải...</p> : null}
      {rows ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th className="ls-stt">STT</th><th>Ngày</th><th>Loại</th><th>Lô</th><th>Nhập</th><th>Xuất</th><th>Tồn</th><th>Số phiếu / người nhận</th></tr></thead>
            <tbody>
              {rows.map((r, idx) => {
                const d = Number(r.quantity_delta);
                return (
                  <tr key={r.id}>
                    <td className="ls-stt">{idx + 1}</td>
                    <td>{fmtDate(r.movement_date)}</td>
                    <td>{MOVEMENT_LABEL[r.movement_type]}{r.reason_code ? <span className="subline">{REASON_LABEL[r.reason_code] || r.reason_code}</span> : null}</td>
                    <td>{r.lot?.lot_number || "—"}</td>
                    <td>{d > 0 ? formatQuantity(d) : ""}</td>
                    <td>{d < 0 ? formatQuantity(Math.abs(d)) : ""}</td>
                    <td><strong>{formatQuantity(r.balance)}</strong></td>
                    <td>{[r.reference_no, r.counterparty].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={8}><div className="empty-state">Vật tư chưa có phiếu nào.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {truncated ? <p className="muted tiny">Chỉ hiện 5.000 phiếu đầu; dùng Xuất Excel/sổ theo ngày để xem đầy đủ.</p> : null}
    </section>
  );
}
