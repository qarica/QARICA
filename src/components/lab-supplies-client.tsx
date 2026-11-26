"use client";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icon";
import {
  ADJUST_REASON_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  DISPOSAL_REASON_LABEL,
  EXPIRY_REQUIRED_CATEGORIES,
  MOVEMENT_LABEL,
  REASON_LABEL,
  daysUntilExpiry,
  formatQuantity,
  itemStockStatus,
  lotExpiryStatus,
  sortLotsFefo,
  type MovementType,
  type SupplyCategory,
} from "@/lib/lab-supplies";

type Item = {
  id: string;
  code: string;
  name: string;
  category: SupplyCategory;
  unit: string;
  manufacturer: string | null;
  storage_condition: string | null;
  min_stock: number | string;
  expiry_warning_days: number;
  is_active: boolean;
  notes: string | null;
};
type Lot = { lot_id: string; item_id: string; lot_number: string; expiry_date: string | null; balance: number | string };
type Movement = {
  id: string;
  movement_type: MovementType;
  quantity_delta: number | string;
  movement_date: string;
  reference_no: string | null;
  counterparty: string | null;
  reason_code: string | null;
  note: string | null;
  system_quantity: number | string | null;
  counted_quantity: number | string | null;
  created_at: string;
  actor_name: string;
  item: { code: string; name: string; unit: string } | null;
  lot: { lot_number: string; expiry_date: string | null } | null;
};
type Closing = { id: string; period_end: string; note: string | null } | null;
type ReportRow = {
  item_id: string; code: string; name: string; unit: string; category: SupplyCategory; is_active: boolean; min_stock: number;
  opening: number; receipts: number; issues: number; disposals: number; adjustments: number; closing: number;
};

type Tab = "stock" | "catalog" | "ledger" | "report" | "stocktake";
type AlertFilter = "ALL" | "STOCK" | "EXPIRING" | "EXPIRED";
type Toast = { tone: "success" | "error"; text: string } | null;

type ItemForm = {
  id?: string; code: string; name: string; category: SupplyCategory; unit: string; manufacturer: string;
  storage_condition: string; min_stock: string; expiry_warning_days: string; is_active: boolean; notes: string;
};
const EMPTY_ITEM: ItemForm = { code: "", name: "", category: "REAGENT", unit: "", manufacturer: "", storage_condition: "", min_stock: "0", expiry_warning_days: "30", is_active: true, notes: "" };

type MoveForm = {
  mode: MovementType;
  item_id: string;
  lot_id: string;
  lot_label: string;
  max_quantity: number | null;
  lot_number: string;
  expiry_date: string;
  quantity: string;
  movement_date: string;
  reference_no: string;
  counterparty: string;
  reason_code: string;
  note: string;
};

async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Thao tác không thành công.");
  return json;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

export function LabSuppliesClient({ items, lots, movements, lastClosing, today, canManage }: { items: Item[]; lots: Lot[]; movements: Movement[]; lastClosing: Closing; today: string; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stock");
  const [search, setSearch] = useState("");
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [moveForm, setMoveForm] = useState<MoveForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [ledgerType, setLedgerType] = useState<"" | MovementType>("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lotsByItem = useMemo(() => {
    const map = new Map<string, Lot[]>();
    for (const lot of lots) map.set(lot.item_id, [...(map.get(lot.item_id) || []), lot]);
    for (const [k, v] of map) map.set(k, sortLotsFefo(v));
    return map;
  }, [lots]);

  const itemRows = useMemo(() => {
    return items
      .map((item) => {
        const itemLots = lotsByItem.get(item.id) || [];
        const total = itemLots.reduce((sum, l) => sum + num(l.balance), 0);
        const lotStates = itemLots.map((l) => lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today));
        return {
          item,
          total,
          stock: itemStockStatus(total, num(item.min_stock)),
          expired: lotStates.filter((s) => s === "EXPIRED").length,
          expiring: lotStates.filter((s) => s === "EXPIRING").length,
        };
      })
      .filter((r) => showInactive || r.item.is_active || r.total > 0);
  }, [items, lotsByItem, today, showInactive]);

  const kpi = useMemo(() => {
    const active = itemRows.filter((r) => r.item.is_active);
    return {
      itemCount: active.length,
      low: active.filter((r) => r.stock !== "OK").length,
      expiring: itemRows.reduce((s, r) => s + r.expiring, 0),
      expired: itemRows.reduce((s, r) => s + r.expired, 0),
    };
  }, [itemRows]);

  const q = search.trim().toLowerCase();
  const visibleItemRows = itemRows.filter((r) => {
    if (q && ![r.item.code, r.item.name, r.item.manufacturer].some((v) => (v || "").toLowerCase().includes(q))) return false;
    if (alertFilter === "STOCK") return r.item.is_active && r.stock !== "OK";
    if (alertFilter === "EXPIRING") return r.expiring > 0;
    if (alertFilter === "EXPIRED") return r.expired > 0;
    return true;
  });

  const lotRows = useMemo(() => {
    const rows: { lot: Lot; item: Item; state: ReturnType<typeof lotExpiryStatus>; days: number | null }[] = [];
    for (const row of itemRows) {
      for (const lot of lotsByItem.get(row.item.id) || []) {
        rows.push({ lot, item: row.item, state: lotExpiryStatus(lot.expiry_date, row.item.expiry_warning_days, today), days: daysUntilExpiry(lot.expiry_date, today) });
      }
    }
    return rows.filter((r) => {
      if (q && ![r.item.code, r.item.name, r.lot.lot_number].some((v) => (v || "").toLowerCase().includes(q))) return false;
      if (alertFilter === "EXPIRING") return r.state === "EXPIRING";
      if (alertFilter === "EXPIRED") return r.state === "EXPIRED";
      return true;
    });
  }, [itemRows, lotsByItem, today, q, alertFilter]);

  function openMove(mode: MovementType, lotRow?: { lot: Lot; item: Item; state: string }) {
    setToast(null);
    const expired = lotRow?.state === "EXPIRED";
    setMoveForm({
      mode,
      item_id: lotRow?.item.id || "",
      lot_id: lotRow?.lot.lot_id || "",
      lot_label: lotRow ? `${lotRow.item.code} — ${lotRow.item.name} · lô ${lotRow.lot.lot_number}` : "",
      max_quantity: lotRow ? num(lotRow.lot.balance) : null,
      lot_number: "",
      expiry_date: "",
      quantity: mode === "DISPOSAL" && lotRow && expired ? String(num(lotRow.lot.balance)) : "",
      movement_date: today,
      reference_no: "",
      counterparty: "",
      reason_code: mode === "DISPOSAL" ? (expired ? "EXPIRED" : "DAMAGED") : mode === "ADJUST" ? "SHRINKAGE" : "",
      note: "",
    });
  }

  async function submitItem(e: FormEvent) {
    e.preventDefault();
    if (!itemForm) return;
    if (!itemForm.code.trim() || !itemForm.name.trim() || !itemForm.unit.trim()) return setToast({ tone: "error", text: "Vui lòng nhập mã, tên và đơn vị tính." });
    setBusy(true);
    setToast(null);
    try {
      const payload: Record<string, unknown> = {
        name: itemForm.name.trim(), category: itemForm.category, unit: itemForm.unit.trim(),
        manufacturer: itemForm.manufacturer.trim() || null, storage_condition: itemForm.storage_condition.trim() || null,
        min_stock: itemForm.min_stock, expiry_warning_days: itemForm.expiry_warning_days, notes: itemForm.notes.trim() || null,
      };
      if (itemForm.id) payload.is_active = itemForm.is_active;
      else payload.code = itemForm.code.trim();
      await callApi(itemForm.id ? `/api/lab-supplies/items/${itemForm.id}` : "/api/lab-supplies/items", itemForm.id ? "PATCH" : "POST", payload);
      setItemForm(null);
      setToast({ tone: "success", text: itemForm.id ? "Đã cập nhật vật tư." : "Đã thêm vật tư." });
      router.refresh();
    } catch (err) {
      setToast({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  async function submitMove(e: FormEvent) {
    e.preventDefault();
    if (!moveForm) return;
    setBusy(true);
    setToast(null);
    try {
      const body: Record<string, unknown> = {
        movement_type: moveForm.mode, quantity: moveForm.quantity, movement_date: moveForm.movement_date,
        reference_no: moveForm.reference_no, counterparty: moveForm.counterparty, note: moveForm.note,
      };
      if (moveForm.mode === "RECEIPT") {
        body.item_id = moveForm.item_id;
        body.lot_number = moveForm.lot_number;
        body.expiry_date = moveForm.expiry_date;
      } else {
        body.lot_id = moveForm.lot_id;
        body.reason_code = moveForm.reason_code;
      }
      await callApi("/api/lab-supplies/movements", "POST", body);
      setMoveForm(null);
      setToast({ tone: "success", text: `${MOVEMENT_LABEL[moveForm.mode]} thành công.` });
      router.refresh();
    } catch (err) {
      setToast({ tone: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  const selectedReceiptItem = moveForm?.mode === "RECEIPT" ? itemById.get(moveForm.item_id) : undefined;
  const expiryRequired = selectedReceiptItem ? EXPIRY_REQUIRED_CATEGORIES.includes(selectedReceiptItem.category) : false;

  const ledgerRows = movements.filter((m) => {
    if (ledgerType && m.movement_type !== ledgerType) return false;
    if (!q) return true;
    return [m.item?.code, m.item?.name, m.lot?.lot_number, m.reference_no, m.counterparty, m.note].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <div className="lab-supplies">
      {toast ? <div className={`alert ${toast.tone}`}>{toast.text}</div> : null}

      <div className="ls-tabs" role="tablist">
        {([
          ["stock", "Tồn kho"], ["catalog", "Danh mục"], ["ledger", "Sổ xuất nhập"], ["report", "Báo cáo Nhập–Xuất–Tồn"], ["stocktake", "Kiểm kê"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "stock" ? (
        <>
          <section className="panel">
            <div className="ls-kpis">
              <div className="ls-kpi"><span>Vật tư đang dùng</span><strong>{kpi.itemCount}</strong></div>
              <div className="ls-kpi warn"><span>Sắp hết / hết hàng</span><strong>{kpi.low}</strong></div>
              <div className="ls-kpi warn"><span>Lô sắp hết hạn</span><strong>{kpi.expiring}</strong></div>
              <div className="ls-kpi bad"><span>Lô đã hết hạn còn tồn</span><strong>{kpi.expired}</strong></div>
            </div>
            <div className="toolbar">
              <div className="toolbar-left">
                <div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo mã, tên vật tư, số lô..." /></div>
                <select value={alertFilter} onChange={(e) => setAlertFilter(e.target.value as AlertFilter)} aria-label="Lọc cảnh báo">
                  <option value="ALL">Tất cả</option><option value="STOCK">Sắp hết / hết hàng</option><option value="EXPIRING">Sắp hết hạn</option><option value="EXPIRED">Đã hết hạn</option>
                </select>
                <label className="inline-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện vật tư ngưng dùng</label>
              </div>
              {canManage ? <button className="button primary" onClick={() => openMove("RECEIPT")}><Icon name="plus" size={18} /> Nhập kho</button> : null}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th>Tồn</th><th>Định mức tối thiểu</th><th>Cảnh báo</th></tr></thead>
                <tbody>
                  {visibleItemRows.map((r) => (
                    <tr key={r.item.id}>
                      <td><code className="code-pill">{r.item.code}</code></td>
                      <td><strong>{r.item.name}</strong>{!r.item.is_active ? <span className="status-badge muted">Ngưng dùng</span> : null}<span className="subline">{CATEGORY_LABEL[r.item.category]}</span></td>
                      <td>{r.item.unit}</td>
                      <td><strong>{formatQuantity(r.total)}</strong></td>
                      <td>{formatQuantity(r.item.min_stock)}</td>
                      <td>
                        {r.stock === "OUT" ? <span className="status-badge danger">Hết hàng</span> : r.stock === "LOW" ? <span className="status-badge warning">Sắp hết</span> : <span className="status-badge success">Đủ</span>}
                        {r.expired ? <span className="status-badge danger">{r.expired} lô hết hạn</span> : null}
                        {r.expiring ? <span className="status-badge warning">{r.expiring} lô sắp hết hạn</span> : null}
                      </td>
                    </tr>
                  ))}
                  {!visibleItemRows.length ? <tr><td colSpan={6}><div className="empty-state">Chưa có vật tư phù hợp.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><div><h2>Chi tiết tồn theo lô</h2><p>Xếp theo hạn dùng gần nhất trước (FEFO). Lô đã hết hạn không xuất dùng được — chỉ hủy hàng.</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Vật tư</th><th>Số lô</th><th>Hạn dùng</th><th>Tồn</th>{canManage ? <th></th> : null}</tr></thead>
                <tbody>
                  {lotRows.map((r) => (
                    <tr key={r.lot.lot_id}>
                      <td><strong>{r.item.name}</strong><span className="subline">{r.item.code}</span></td>
                      <td>{r.lot.lot_number}</td>
                      <td>
                        {r.lot.expiry_date || "—"}
                        {r.state === "EXPIRED" ? <span className="status-badge danger">Hết hạn</span> : null}
                        {r.state === "EXPIRING" ? <span className="status-badge warning">Còn {r.days} ngày</span> : null}
                      </td>
                      <td><strong>{formatQuantity(r.lot.balance)}</strong> {r.item.unit}</td>
                      {canManage ? (
                        <td>
                          <div className="ls-row-actions">
                            {r.state !== "EXPIRED" ? <button className="button tertiary small" onClick={() => openMove("ISSUE", r)}>Xuất dùng</button> : null}
                            <button className="button tertiary small" onClick={() => openMove("DISPOSAL", r)}>Hủy</button>
                            <button className="button tertiary small" onClick={() => openMove("ADJUST", r)}>Điều chỉnh</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!lotRows.length ? <tr><td colSpan={canManage ? 5 : 4}><div className="empty-state">Chưa có lô nào còn tồn.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "catalog" ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo mã, tên, hãng..." /></div>
              <label className="inline-check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện vật tư ngưng dùng</label>
            </div>
            {canManage ? <button className="button primary" onClick={() => { setItemForm({ ...EMPTY_ITEM }); setToast(null); }}><Icon name="plus" size={18} /> Thêm vật tư</button> : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mã</th><th>Tên vật tư</th><th>Nhóm</th><th>ĐVT</th><th>Hãng SX</th><th>Bảo quản</th><th>Định mức</th><th>Báo hết hạn trước</th>{canManage ? <th></th> : null}</tr></thead>
              <tbody>
                {items.filter((i) => (showInactive || i.is_active) && (!q || [i.code, i.name, i.manufacturer].some((v) => (v || "").toLowerCase().includes(q)))).map((i) => (
                  <tr key={i.id}>
                    <td><code className="code-pill">{i.code}</code></td>
                    <td><strong>{i.name}</strong>{!i.is_active ? <span className="status-badge muted">Ngưng dùng</span> : null}</td>
                    <td>{CATEGORY_LABEL[i.category]}</td>
                    <td>{i.unit}</td>
                    <td>{i.manufacturer || "—"}</td>
                    <td>{i.storage_condition || "—"}</td>
                    <td>{formatQuantity(i.min_stock)}</td>
                    <td>{i.expiry_warning_days} ngày</td>
                    {canManage ? (
                      <td><button className="button tertiary small" onClick={() => { setItemForm({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, manufacturer: i.manufacturer || "", storage_condition: i.storage_condition || "", min_stock: String(num(i.min_stock)), expiry_warning_days: String(i.expiry_warning_days), is_active: i.is_active, notes: i.notes || "" }); setToast(null); }}><Icon name="pencil" size={15} /> Sửa</button></td>
                    ) : null}
                  </tr>
                ))}
                {!items.length ? <tr><td colSpan={canManage ? 9 : 8}><div className="empty-state">Chưa có vật tư nào. Thêm vật tư rồi nhập kho theo lô.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "ledger" ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo vật tư, lô, số phiếu, người nhận..." /></div>
              <select value={ledgerType} onChange={(e) => setLedgerType(e.target.value as "" | MovementType)} aria-label="Lọc loại phiếu">
                <option value="">Tất cả loại phiếu</option>
                {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
              </select>
            </div>
            <span className="muted">Hiển thị tối đa 300 dòng gần nhất. Sổ không sửa/xóa được — sai sót sửa bằng phiếu điều chỉnh.</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ngày</th><th>Loại</th><th>Vật tư</th><th>Lô</th><th>Số lượng</th><th>Số phiếu</th><th>Người nhận / NCC</th><th>Lý do / ghi chú</th><th>Người ghi</th></tr></thead>
              <tbody>
                {ledgerRows.map((m) => {
                  const delta = num(m.quantity_delta);
                  return (
                    <tr key={m.id}>
                      <td>{m.movement_date}</td>
                      <td><span className={`status-badge ${m.movement_type === "RECEIPT" ? "success" : m.movement_type === "ISSUE" ? "info" : m.movement_type === "DISPOSAL" ? "danger" : "warning"}`}>{MOVEMENT_LABEL[m.movement_type]}</span></td>
                      <td><strong>{m.item?.name || "—"}</strong><span className="subline">{m.item?.code}</span></td>
                      <td>{m.lot?.lot_number || "—"}</td>
                      <td><strong>{delta > 0 ? "+" : ""}{formatQuantity(delta)}</strong> {m.item?.unit}{m.counted_quantity != null ? <span className="subline">sổ {formatQuantity(m.system_quantity)} → đếm {formatQuantity(m.counted_quantity)}</span> : null}</td>
                      <td>{m.reference_no || "—"}</td>
                      <td>{m.counterparty || "—"}</td>
                      <td>{m.reason_code ? `${REASON_LABEL[m.reason_code] || m.reason_code}${m.note ? " — " : ""}` : ""}{m.note || (m.reason_code ? "" : "—")}</td>
                      <td>{m.actor_name || "—"}</td>
                    </tr>
                  );
                })}
                {!ledgerRows.length ? <tr><td colSpan={9}><div className="empty-state">Chưa có phiếu nào.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "report" ? <ReportTab today={today} lastClosing={lastClosing} canManage={canManage} onChanged={() => router.refresh()} /> : null}
      {tab === "stocktake" ? <StocktakeTab lots={lots} itemById={itemById} canManage={canManage} onDone={(text) => { setToast({ tone: "success", text }); router.refresh(); }} onError={(text) => setToast({ tone: "error", text })} /> : null}

      {itemForm ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitItem}>
            <div className="modal-head">
              <div><div className="eyebrow">{itemForm.id ? "CẬP NHẬT" : "THÊM MỚI"}</div><h2>{itemForm.id ? itemForm.name : "Vật tư mới"}</h2></div>
              <button type="button" className="icon-button" onClick={() => !busy && setItemForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body form-stack">
              {toast?.tone === "error" ? <div className="alert error">{toast.text}</div> : null}
              <div className="form-grid two">
                <label>Mã vật tư *<input value={itemForm.code} disabled={!!itemForm.id} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value.toUpperCase() })} placeholder="VD: HC001" /></label>
                <label>Nhóm *<select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value as SupplyCategory })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
                <label className="span-2">Tên vật tư *<input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="VD: Thuốc thử Glucose" /></label>
                <label>Đơn vị tính *<input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} placeholder="Hộp, Chai, Test..." /></label>
                <label>Hãng sản xuất<input value={itemForm.manufacturer} onChange={(e) => setItemForm({ ...itemForm, manufacturer: e.target.value })} /></label>
                <label>Định mức tồn tối thiểu<input inputMode="decimal" value={itemForm.min_stock} onChange={(e) => setItemForm({ ...itemForm, min_stock: e.target.value })} /><small>Tồn ≤ định mức thì cảnh báo sắp hết.</small></label>
                <label>Báo trước hết hạn (ngày)<input inputMode="numeric" value={itemForm.expiry_warning_days} onChange={(e) => setItemForm({ ...itemForm, expiry_warning_days: e.target.value })} /></label>
                <label className="span-2">Điều kiện bảo quản<input value={itemForm.storage_condition} onChange={(e) => setItemForm({ ...itemForm, storage_condition: e.target.value })} placeholder="VD: 2–8°C, tránh ánh sáng" /></label>
                <label className="span-2">Ghi chú<textarea rows={2} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} /></label>
              </div>
              {itemForm.id ? <label className="inline-check"><input type="checkbox" checked={itemForm.is_active} onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.checked })} /> Đang sử dụng (bỏ chọn để ngưng; lịch sử vẫn giữ)</label> : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setItemForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Lưu vật tư"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {moveForm ? (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitMove}>
            <div className="modal-head">
              <div><div className="eyebrow">PHIẾU KHO</div><h2>{MOVEMENT_LABEL[moveForm.mode]}</h2></div>
              <button type="button" className="icon-button" onClick={() => !busy && setMoveForm(null)}><Icon name="x" /></button>
            </div>
            <div className="modal-body form-stack">
              {toast?.tone === "error" ? <div className="alert error">{toast.text}</div> : null}
              <div className="form-grid two">
                {moveForm.mode === "RECEIPT" ? (
                  <>
                    <label className="span-2">Vật tư *
                      <select value={moveForm.item_id} onChange={(e) => setMoveForm({ ...moveForm, item_id: e.target.value })}>
                        <option value="">— Chọn vật tư —</option>
                        {items.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} ({i.unit})</option>)}
                      </select>
                    </label>
                    <label>Số lô *<input value={moveForm.lot_number} onChange={(e) => setMoveForm({ ...moveForm, lot_number: e.target.value })} /></label>
                    <label>Hạn dùng{expiryRequired ? " *" : ""}<input type="date" value={moveForm.expiry_date} onChange={(e) => setMoveForm({ ...moveForm, expiry_date: e.target.value })} /></label>
                  </>
                ) : (
                  <div className="span-2 ls-lot-box"><strong>{moveForm.lot_label}</strong>{moveForm.max_quantity != null ? <span>Tồn hiện tại: {formatQuantity(moveForm.max_quantity)}</span> : null}</div>
                )}
                <label>{moveForm.mode === "ADJUST" ? "Số lượng điều chỉnh * (âm = giảm)" : "Số lượng *"}<input inputMode="decimal" value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} /></label>
                <label>Ngày phiếu *<input type="date" max={today} min={lastClosing ? lastClosing.period_end : undefined} value={moveForm.movement_date} onChange={(e) => setMoveForm({ ...moveForm, movement_date: e.target.value })} /></label>
                {moveForm.mode === "DISPOSAL" ? (
                  <label className="span-2">Lý do hủy *<select value={moveForm.reason_code} onChange={(e) => setMoveForm({ ...moveForm, reason_code: e.target.value })}>{Object.entries(DISPOSAL_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                ) : null}
                {moveForm.mode === "ADJUST" ? (
                  <label className="span-2">Lý do điều chỉnh *<select value={moveForm.reason_code} onChange={(e) => setMoveForm({ ...moveForm, reason_code: e.target.value })}>{Object.entries(ADJUST_REASON_LABEL).filter(([k]) => k !== "STOCKTAKE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><small>Điều chỉnh do kiểm kê dùng tab &quot;Kiểm kê&quot;.</small></label>
                ) : null}
                {moveForm.mode === "ISSUE" ? <label className="span-2">Người nhận / nơi sử dụng *<input value={moveForm.counterparty} onChange={(e) => setMoveForm({ ...moveForm, counterparty: e.target.value })} placeholder="VD: Khoa XN lĩnh dùng tuần 4" /></label> : null}
                {moveForm.mode === "RECEIPT" ? <label className="span-2">Nhà cung cấp<input value={moveForm.counterparty} onChange={(e) => setMoveForm({ ...moveForm, counterparty: e.target.value })} /></label> : null}
                {moveForm.mode === "RECEIPT" || moveForm.mode === "ISSUE" ? <label className="span-2">Số phiếu / hóa đơn<input value={moveForm.reference_no} onChange={(e) => setMoveForm({ ...moveForm, reference_no: e.target.value })} /></label> : null}
                <label className="span-2">Ghi chú{moveForm.mode === "DISPOSAL" || moveForm.mode === "ADJUST" ? " *" : ""}<textarea rows={2} value={moveForm.note} onChange={(e) => setMoveForm({ ...moveForm, note: e.target.value })} /></label>
              </div>
              {lastClosing ? <small className="muted">Đã chốt kỳ đến {lastClosing.period_end}: không ghi phiếu có ngày ≤ ngày này.</small> : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setMoveForm(null)} disabled={busy}>Hủy</button>
              <button className="button primary" disabled={busy}><Icon name="save" size={17} />{busy ? "Đang lưu..." : "Xác nhận phiếu"}</button>
            </div>
          </form>
        </div>
      ) : null}

      <style>{`
        .lab-supplies .ls-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
        .lab-supplies .ls-tabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 16px;font-weight:700;font-size:13px;cursor:pointer}
        .lab-supplies .ls-tabs button.active{background:var(--brand,#0f766e);color:#fff;border-color:var(--brand,#0f766e)}
        .lab-supplies .ls-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:16px 19px 4px}
        .lab-supplies .ls-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0}
        .lab-supplies .ls-kpi span{font-size:11px;color:var(--muted);font-weight:700}
        .lab-supplies .ls-kpi strong{font-size:22px}
        .lab-supplies .ls-kpi.warn strong{color:#b45309}
        .lab-supplies .ls-kpi.bad strong{color:#b91c1c}
        .lab-supplies .ls-row-actions{display:flex;gap:6px;flex-wrap:wrap}
        .lab-supplies .ls-lot-box{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#f8fafb}
        .lab-supplies .ls-lot-box span{font-size:12px;color:var(--muted)}
        .lab-supplies .ls-range{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
        .lab-supplies .ls-range label{min-width:150px}
        .lab-supplies .ls-num{text-align:right;font-variant-numeric:tabular-nums}
        .lab-supplies .status-badge+.status-badge{margin-left:6px}
        @media(max-width:760px){.lab-supplies .ls-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Báo cáo Nhập – Xuất – Tồn theo kỳ + chốt kỳ (tính từ sổ, không có tồn nhập tay)
// ---------------------------------------------------------------------------
function ReportTab({ today, lastClosing, canManage, onChanged }: { today: string; lastClosing: Closing; canManage: boolean; onChanged: () => void }) {
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Toast>(null);
  const [closeDate, setCloseDate] = useState(today);
  const [closeNote, setCloseNote] = useState("");

  async function load() {
    setBusy(true);
    setMessage(null);
    try {
      const json = await callApi(`/api/lab-supplies/report?from=${from}&to=${to}`, "GET");
      setRows(json.rows as ReportRow[]);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Không tải được báo cáo." });
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod() {
    if (!window.confirm(`Chốt kỳ đến hết ngày ${closeDate}? Sau khi chốt sẽ không ghi thêm phiếu có ngày ≤ ${closeDate} và không hoàn tác được.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await callApi("/api/lab-supplies/closings", "POST", { period_end: closeDate, note: closeNote });
      setMessage({ tone: "success", text: `Đã chốt kỳ đến ${closeDate}.` });
      onChanged();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Không chốt được kỳ." });
    } finally {
      setBusy(false);
    }
  }

  const visible = (rows || []).filter((r) => r.is_active || [r.opening, r.receipts, r.issues, r.disposals, r.adjustments, r.closing].some((v) => v !== 0));

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="ls-range">
          <label>Từ ngày<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="button primary" onClick={load} disabled={busy}><Icon name="refresh-cw" size={17} /> Xem báo cáo</button>
          <Link className="button tertiary" href={`/api/lab-supplies/report?from=${from}&to=${to}&format=csv`}><Icon name="download" size={18} /> Xuất Excel</Link>
        </div>
      </div>
      {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th className="ls-num">Tồn đầu kỳ</th><th className="ls-num">Nhập</th><th className="ls-num">Xuất dùng</th><th className="ls-num">Hủy</th><th className="ls-num">Điều chỉnh</th><th className="ls-num">Tồn cuối kỳ</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.item_id}>
                <td><code className="code-pill">{r.code}</code></td>
                <td><strong>{r.name}</strong></td>
                <td>{r.unit}</td>
                <td className="ls-num">{formatQuantity(r.opening)}</td>
                <td className="ls-num">{formatQuantity(r.receipts)}</td>
                <td className="ls-num">{formatQuantity(r.issues)}</td>
                <td className="ls-num">{formatQuantity(r.disposals)}</td>
                <td className="ls-num">{formatQuantity(r.adjustments)}</td>
                <td className="ls-num"><strong>{formatQuantity(r.closing)}</strong></td>
              </tr>
            ))}
            {rows === null ? <tr><td colSpan={9}><div className="empty-state">Chọn khoảng ngày rồi bấm &quot;Xem báo cáo&quot;.</div></td></tr> : null}
            {rows !== null && !visible.length ? <tr><td colSpan={9}><div className="empty-state">Không có số liệu trong kỳ.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ padding: "0 19px" }}>Tồn đầu kỳ = tổng sổ trước ngày bắt đầu; tồn cuối = tổng sổ đến hết ngày kết thúc. Không có số tồn nhập tay nên báo cáo luôn khớp sổ xuất nhập.</p>
      {canManage ? (
        <div className="toolbar">
          <div className="ls-range">
            <label>Chốt kỳ đến ngày<input type="date" value={closeDate} max={today} min={lastClosing ? lastClosing.period_end : undefined} onChange={(e) => setCloseDate(e.target.value)} /></label>
            <label>Ghi chú<input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="VD: Chốt tháng 11/2026" /></label>
            <button className="button secondary" onClick={closePeriod} disabled={busy}>Chốt kỳ</button>
          </div>
          <span className="muted">{lastClosing ? `Kỳ chốt gần nhất: đến ${lastClosing.period_end}` : "Chưa chốt kỳ nào."}</span>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kiểm kê: nhập số đếm thực tế theo lô; chênh lệch tự sinh phiếu điều chỉnh.
// ---------------------------------------------------------------------------
function StocktakeTab({ lots, itemById, canManage, onDone, onError }: { lots: Lot[]; itemById: Map<string, Item>; canManage: boolean; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => lots.map((lot) => ({ lot, item: itemById.get(lot.item_id) })).filter((r): r is { lot: Lot; item: Item } => !!r.item).sort((a, b) => a.item.code.localeCompare(b.item.code) || (a.lot.expiry_date || "9999").localeCompare(b.lot.expiry_date || "9999")),
    [lots, itemById],
  );
  const filled = rows.filter((r) => (counts[r.lot.lot_id] ?? "").trim() !== "");

  async function submit() {
    if (!filled.length) return onError("Chưa nhập số đếm thực tế cho lô nào.");
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

  return (
    <section className="panel">
      <div className="panel-title"><div><h2>Phiếu kiểm kê</h2><p>Chỉ nhập số đếm cho các lô đã kiểm; lô để trống sẽ không tính. Số đếm bằng tồn sổ thì không phát sinh điều chỉnh.</p></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vật tư</th><th>Số lô</th><th>Hạn dùng</th><th className="ls-num">Tồn sổ</th><th className="ls-num">Số đếm thực tế</th><th className="ls-num">Chênh lệch</th></tr></thead>
          <tbody>
            {rows.map(({ lot, item }) => {
              const raw = counts[lot.lot_id] ?? "";
              const counted = raw.trim() === "" ? null : Number(raw.replace(",", "."));
              const diff = counted !== null && Number.isFinite(counted) ? counted - num(lot.balance) : null;
              return (
                <tr key={lot.lot_id}>
                  <td><strong>{item.name}</strong><span className="subline">{item.code}</span></td>
                  <td>{lot.lot_number}</td>
                  <td>{lot.expiry_date || "—"}</td>
                  <td className="ls-num">{formatQuantity(lot.balance)} {item.unit}</td>
                  <td className="ls-num"><input inputMode="decimal" value={raw} disabled={!canManage} onChange={(e) => setCounts({ ...counts, [lot.lot_id]: e.target.value })} style={{ maxWidth: 110, textAlign: "right" }} /></td>
                  <td className="ls-num">{diff === null ? "—" : <strong style={{ color: diff === 0 ? undefined : diff < 0 ? "#b91c1c" : "#b45309" }}>{diff > 0 ? "+" : ""}{formatQuantity(diff)}</strong>}</td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={6}><div className="empty-state">Chưa có lô nào còn tồn để kiểm kê.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <div className="toolbar">
          <div className="toolbar-left"><div className="search-box"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú phiếu kiểm kê (tùy chọn)" /></div></div>
          <button className="button primary" onClick={submit} disabled={busy || !filled.length}><Icon name="save" size={17} />{busy ? "Đang ghi..." : `Ghi kiểm kê (${filled.length} lô)`}</button>
        </div>
      ) : null}
    </section>
  );
}
