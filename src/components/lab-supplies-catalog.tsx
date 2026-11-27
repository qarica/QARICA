"use client";

import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { LabImportDialog } from "@/components/lab-supplies-import-dialog";
import { CATEGORY_LABEL, KIND_CATEGORIES, formatQuantity, type SupplyCategory, type SupplyKind } from "../lib/lab-supplies";
import { callApi, num, type Item } from "./lab-supplies-types";

type ItemForm = {
  id?: string; code: string; barcode: string; name: string; category: SupplyCategory; unit: string; manufacturer: string;
  storage_condition: string; min_stock: string; expiry_warning_days: string; is_active: boolean; notes: string;
};
const EMPTY_ITEM: ItemForm = { code: "", barcode: "", name: "", category: "REAGENT", unit: "", manufacturer: "", storage_condition: "", min_stock: "0", expiry_warning_days: "30", is_active: true, notes: "" };

// DANH MỤC = thiết lập vật tư (làm một lần, thỉnh thoảng sửa) nên đặt cuối cùng. Thêm từng cái hoặc nhập hàng loạt từ Excel.
export function LabCatalog({ supplyKind, items, canManage, search, seed, onOpen, onChanged }: { supplyKind: SupplyKind; items: Item[]; canManage: boolean; search: string; seed: { barcode: string; key: number } | null; onOpen: (id: string) => void; onChanged: (text: string) => void }) {
  const [form, setForm] = useState<ItemForm | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (seed) { setFormError(""); setForm({ ...EMPTY_ITEM, category: KIND_CATEGORIES[supplyKind][0], barcode: seed.barcode }); }
  }, [seed, supplyKind]);

  const q = search.trim().toLowerCase();
  const rows = items.filter((i) => (showInactive || i.is_active) && (!q || [i.code, i.barcode, i.name, i.manufacturer].some((v) => (v || "").toLowerCase().includes(q))));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.code.trim() || !form.name.trim() || !form.unit.trim()) return setFormError("Vui lòng nhập mã, tên và đơn vị tính.");
    setBusy(true);
    setFormError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), barcode: form.barcode.trim() || null, category: form.category, unit: form.unit.trim(),
        manufacturer: form.manufacturer.trim() || null, storage_condition: form.storage_condition.trim() || null,
        min_stock: form.min_stock, expiry_warning_days: form.expiry_warning_days, notes: form.notes.trim() || null,
      };
      if (form.id) payload.is_active = form.is_active;
      else payload.code = form.code.trim();
      await callApi(form.id ? `/api/lab-supplies/items/${form.id}` : "/api/lab-supplies/items", form.id ? "PATCH" : "POST", payload);
      setForm(null);
      onChanged(form.id ? "Đã cập nhật vật tư." : "Đã thêm vật tư.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="ls-bar">
        <label className="inline-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện vật tư ngưng dùng</label>
        <span className="ls-grow" />
        {canManage ? (
          <>
            <button type="button" className="button secondary" onClick={() => setImportOpen(true)}><Icon name="upload" size={16} /> Nhập từ Excel</button>
            <button type="button" className="button primary" onClick={() => { setFormError(""); setForm({ ...EMPTY_ITEM, category: KIND_CATEGORIES[supplyKind][0] }); }}><Icon name="plus" size={16} /> Thêm vật tư</button>
          </>
        ) : null}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="ls-stt">STT</th><th>Mã</th><th>Tên vật tư</th><th>Nhóm</th><th>ĐVT</th><th>Hãng SX</th><th className="ls-num">Định mức</th><th className="ls-num">Báo hết hạn trước</th>{canManage ? <th /> : null}</tr></thead>
          <tbody>
            {rows.map((i, idx) => (
              <tr key={i.id}>
                <td className="ls-stt">{idx + 1}</td>
                <td><code className="code-pill">{i.code}</code>{i.barcode ? <span className="subline">▮ {i.barcode}</span> : null}</td>
                <td><button type="button" className="table-link ls-name-btn" onClick={() => onOpen(i.id)}><strong>{i.name}</strong></button>{!i.is_active ? <span className="status-badge muted">Ngưng dùng</span> : null}{i.storage_condition ? <span className="subline">{i.storage_condition}</span> : null}</td>
                <td>{CATEGORY_LABEL[i.category]}</td>
                <td>{i.unit}</td>
                <td>{i.manufacturer || "—"}</td>
                <td className="ls-num">{num(i.min_stock) > 0 ? formatQuantity(i.min_stock) : "—"}</td>
                <td className="ls-num">{i.expiry_warning_days} ngày</td>
                {canManage ? (
                  <td className="ls-num"><button type="button" className="button tertiary small" onClick={() => { setFormError(""); setForm({ id: i.id, code: i.code, barcode: i.barcode || "", name: i.name, category: i.category, unit: i.unit, manufacturer: i.manufacturer || "", storage_condition: i.storage_condition || "", min_stock: String(num(i.min_stock)), expiry_warning_days: String(i.expiry_warning_days), is_active: i.is_active, notes: i.notes || "" }); }}><Icon name="pencil" size={15} /> Sửa</button></td>
                ) : null}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={canManage ? 9 : 8}><div className="empty-state">Chưa có vật tư nào. Thêm vật tư hoặc nhập từ Excel, rồi qua tab Nhập kho.</div></td></tr> : null}
          </tbody>
        </table>
      </div>

      {importOpen ? <LabImportDialog supplyKind={supplyKind} onClose={() => setImportOpen(false)} onImported={(text) => { setImportOpen(false); onChanged(text); }} /> : null}

      {form ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-head">
              <div><div className="eyebrow">DANH MỤC</div><h2>{form.id ? "Sửa vật tư" : "Thêm vật tư"}</h2></div>
              <button type="button" className="icon-button" onClick={() => !busy && setForm(null)} aria-label="Đóng"><Icon name="x" /></button>
            </div>
            <div className="modal-body form-stack">
              {formError ? <div className="alert error">{formError}</div> : null}
              <div className="form-grid two">
                <label>Mã vật tư *<input value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="VD: HC001" /></label>
                <label>Nhóm *<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SupplyCategory })}>{KIND_CATEGORIES[supplyKind].map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
                <label className="span-2">Mã vạch / mã QR trên hộp<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Quét hoặc gõ mã in trên hộp (tuỳ chọn)" autoComplete="off" /><small>Quét mã này ở thanh “Tìm hoặc quét mã” để mở nhanh vật tư. Mỗi mã chỉ gắn cho 1 vật tư; để trống thì quét bằng mã vật tư.</small></label>
                <label className="span-2">Tên vật tư *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Thuốc thử Glucose" /></label>
                <label>Đơn vị tính *<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Hộp, Chai, Test..." /></label>
                <label>Hãng sản xuất<input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></label>
                <label>Định mức tồn tối thiểu<input inputMode="decimal" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /><small>Tồn ≤ định mức thì cảnh báo “Dưới định mức” và vào danh sách cần bổ sung.</small></label>
                <label>Báo trước hết hạn (ngày)<input inputMode="numeric" value={form.expiry_warning_days} onChange={(e) => setForm({ ...form, expiry_warning_days: e.target.value })} /></label>
                <label className="span-2">Điều kiện bảo quản<input value={form.storage_condition} onChange={(e) => setForm({ ...form, storage_condition: e.target.value })} placeholder="VD: 2–8°C, tránh ánh sáng" /></label>
                <label className="span-2">Ghi chú<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              </div>
              {form.id ? <label className="inline-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Đang sử dụng (bỏ chọn để ngưng dùng; vật tư còn tồn vẫn hiện)</label> : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu vật tư"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
