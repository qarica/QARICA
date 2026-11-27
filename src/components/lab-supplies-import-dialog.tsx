"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import type { SupplyKind } from "../lib/lab-supplies";

type PreviewRow = { rowNumber: number; code: string; name: string; errors: string[] };
type Summary = { total: number; valid: number; invalid: number };

// Nhập danh mục vật tư từ Excel/CSV: chọn file → "Xem trước" (KHÔNG ghi) → xác nhận mới ghi các dòng hợp lệ.
export function LabImportDialog({ supplyKind, onClose, onImported }: { supplyKind: SupplyKind; onClose: () => void; onImported: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(mode: "preview" | "commit") {
    if (!file) return setError("Vui lòng chọn file Excel (.xlsx) hoặc CSV.");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", mode);
      form.set("kind", supplyKind);
      const res = await fetch("/api/lab-supplies/items/import", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.rows) { setRows(json.rows); setSummary(json.summary); }
        throw new Error(json.error || "Không xử lý được file.");
      }
      setRows(json.rows);
      setSummary(json.summary);
      if (mode === "commit") onImported(`Đã nhập ${json.imported} vật tư${json.summary.invalid ? `, bỏ qua ${json.summary.invalid} dòng lỗi` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  const bad = (rows ?? []).filter((r) => r.errors.length);
  return (
    <div className="modal-backdrop">
      <div className="modal-card xl" role="dialog" aria-label="Nhập danh mục từ Excel">
        <div className="modal-head">
          <div><div className="eyebrow">DANH MỤC</div><h2>Nhập vật tư từ Excel / CSV</h2></div>
          <button type="button" className="icon-button" onClick={() => !busy && onClose()} aria-label="Đóng"><Icon name="x" /></button>
        </div>
        <div className="modal-body form-stack">
          {error ? <div className="alert error">{error}</div> : null}
          <p className="muted tiny">Tải file mẫu, điền danh mục (các cột: Mã vật tư*, Tên vật tư*, Nhóm, Đơn vị tính*, Hãng sản xuất, Mã vạch, Định mức tối thiểu, Báo hết hạn trước (ngày), Điều kiện bảo quản, Ghi chú) rồi lưu thành .xlsx hoặc .csv. Mã đã có trong kho hoặc bị lặp sẽ bị bỏ qua.</p>
          <div className="ls-import-actions">
            <a className="button secondary small" href="/api/lab-supplies/items/import" download><Icon name="download" size={15} /> Tải file mẫu</a>
            <input type="file" accept=".xlsx,.csv" aria-label="Chọn file danh mục" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); setSummary(null); setError(""); }} />
            <button type="button" className="button primary small" disabled={busy || !file} onClick={() => void send("preview")}>{busy ? "Đang xử lý..." : "Xem trước"}</button>
          </div>
          {summary ? <div className="alert success">Tìm thấy {summary.total} dòng: <strong>{summary.valid} hợp lệ</strong>{summary.invalid ? `, ${summary.invalid} dòng lỗi (sẽ bị bỏ qua)` : ""}.</div> : null}
          {bad.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Dòng</th><th>Mã</th><th>Tên</th><th>Lỗi</th></tr></thead>
                <tbody>{bad.slice(0, 100).map((r) => <tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.code || "—"}</td><td>{r.name || "—"}</td><td className="text-danger">{r.errors.join("; ")}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="button" className="button primary" disabled={busy || !summary || summary.valid === 0} onClick={() => void send("commit")}><Icon name="save" size={17} /> Nhập {summary?.valid ?? 0} vật tư hợp lệ</button>
        </div>
      </div>
    </div>
  );
}
