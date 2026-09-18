"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Entry = { id: string; code: string | null; name: string; is_active: boolean; description?: string | null; purpose?: string | null };
type Version = { id: string; version_no: number; status: string; criteria_set_id?: string; indicator_definition_id?: string; unit?: string | null; frequency?: string | null; calculation_type?: string | null; desired_direction?: string | null; multiplier?: number | null };
type Item = { id: string; criteria_version_id: string; code: string | null; title: string | null; description: string | null; parent_criteria_item_id: string | null; item_type: string; is_active: boolean; sequence_no: number | null };
type Kind = "criteria" | "indicator" | "checklist";
export function CatalogsClient({ sets, setVersions, items, indicators, indicatorVersions, checklists, canCriteria, canIndicator, canChecklist }: {
  sets: Entry[]; setVersions: Version[]; items: Item[]; indicators: Entry[]; indicatorVersions: Version[]; checklists: { id: string; code: string | null; internal_code: string | null; name: string; source_code: string | null; is_active: boolean }[];
  canCriteria: boolean; canIndicator: boolean; canChecklist: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>("criteria");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"create" | "update" | "">("");
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [itemMode, setItemMode] = useState<"create" | "update" | "">("");
  const [itemId, setItemId] = useState("");
  const [itemForm, setItemForm] = useState({ code: "", title: "", description: "", item_type: "CRITERION", parent_id: "" });
  const [versionForm, setVersionForm] = useState({ unit: "", frequency: "", calculation_type: "", desired_direction: "", multiplier: "1" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rows = tab === "criteria" ? sets : tab === "indicator" ? indicators : checklists;
  const row = rows.find(entry => entry.id === selected);
  const versions = tab === "criteria" ? setVersions : indicatorVersions;
  const version = versions.find(entry => (tab === "criteria" ? entry.criteria_set_id : entry.indicator_definition_id) === selected);
  const currentItems = items.filter(entry => entry.criteria_version_id === version?.id);
  const criteria = currentItems.filter(entry => entry.item_type === "CRITERION");
  const allowed = tab === "criteria" ? canCriteria : tab === "indicator" ? canIndicator : canChecklist;

  async function send(path: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được dữ liệu.");
      setMode(""); setItemMode(""); setMessage("Đã lưu thay đổi.");
      if (result.id) setSelected(result.id);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không lưu được dữ liệu."); }
    finally { setBusy(false); }
  }
  function switchTab(next: Kind) { setTab(next); setSelected(""); setMode(""); setItemMode(""); setMessage(""); }
  function select(entry: Entry) {
    setSelected(entry.id); setMode(""); setItemMode(""); setMessage("");
    const v = (tab === "criteria" ? setVersions : indicatorVersions).find(item => (tab === "criteria" ? item.criteria_set_id : item.indicator_definition_id) === entry.id);
    setVersionForm({ unit: v?.unit || "", frequency: v?.frequency || "", calculation_type: v?.calculation_type || "", desired_direction: v?.desired_direction || "", multiplier: String(v?.multiplier || 1) });
  }
  function startCreate() { setSelected(""); setMode("create"); setForm({ code: "", name: "", description: "" }); setMessage(""); }
  function startEdit() { if (!row) return; setForm({ code: row.code || "", name: row.name, description: row.description || row.purpose || "" }); setMode("update"); }
  function startItemEdit(item?: Item, parentId = "") {
    setItemId(item?.id || ""); setItemMode(item ? "update" : "create");
    setItemForm({ code: item?.code || "", title: item?.title || "", description: item?.description || "", item_type: item?.item_type || (parentId ? "SUBITEM" : "CRITERION"), parent_id: item?.parent_criteria_item_id || parentId });
  }
  const label = tab === "criteria" ? "Bộ tiêu chí" : tab === "indicator" ? "Chỉ số" : "Bảng kiểm";
  return <div className="catalog-workspace">
    <style>{`.catalog-workspace{display:grid;gap:14px}.catalog-tabs{display:flex;gap:8px;flex-wrap:wrap}.catalog-layout{display:grid;grid-template-columns:minmax(240px,330px) minmax(0,1fr);gap:14px}.catalog-list{display:grid;gap:5px}.catalog-row{width:100%;text-align:left;border:1px solid #e0e8ec;border-radius:10px;background:#fff;padding:11px 13px;cursor:pointer;color:#203b47}.catalog-row[aria-current=true]{border-color:#2f747b;background:#edf7f6}.catalog-row strong,.catalog-row span{display:block}.catalog-row span{color:#65767c;font-size:14px;margin-top:3px}.catalog-form{display:grid;gap:10px;max-width:600px}.catalog-form label{display:grid;gap:5px;font-size:14px}.catalog-form input,.catalog-form textarea,.catalog-form select{width:100%;min-height:40px;border:1px solid #cbd8db;border-radius:8px;padding:8px;font:inherit}.catalog-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0}.catalog-item{border-top:1px solid #e4ebec;padding:10px 0}.catalog-subitem{margin-left:18px;border-left:2px solid #dbe8e7;padding-left:12px}@media(max-width:760px){.catalog-layout{grid-template-columns:1fr}}`}</style>
    <nav className="catalog-tabs" aria-label="Loại danh mục">{(["criteria", "indicator", "checklist"] as Kind[]).map((key, index) => <button key={key} type="button" className={`button ${tab === key ? "primary" : "secondary"}`} aria-pressed={tab === key} onClick={() => switchTab(key)}>{["Bộ tiêu chí", "Chỉ số", "Bảng kiểm"][index]}</button>)}</nav>
    {message ? <div className={`alert ${message.startsWith("Đã lưu") ? "success" : "error"}`} role="status">{message}</div> : null}
    <div className="catalog-layout"><section className="panel" style={{ padding: 16 }}><div className="catalog-actions"><h2 style={{ margin: 0, fontSize: 18 }}>{label}</h2>{allowed && tab !== "checklist" ? <button className="button primary small" type="button" onClick={startCreate}>+ Nhập mới</button> : null}{allowed && tab === "checklist" ? <Link className="button primary small" href="/monitoring">+ Tạo bảng kiểm</Link> : null}</div>
      <div className="catalog-list">{rows.map(entry => <button key={entry.id} className="catalog-row" aria-current={selected === entry.id} onClick={() => select(entry)}><strong>{tab === "checklist" ? (entry as typeof checklists[number]).internal_code || entry.code : entry.code || "Chưa có mã"} · {entry.name}</strong><span>{entry.is_active ? "Đang sử dụng" : "Đã ngưng"}</span></button>)}{!rows.length ? <p className="muted">Chưa có danh mục.</p> : null}</div></section>
    <section className="panel" style={{ padding: 18 }}>{mode && tab !== "checklist" ? <form className="catalog-form" onSubmit={event => { event.preventDefault(); send("/api/catalogs", { kind: tab, action: mode, id: selected, ...form }); }}><h2>{mode === "create" ? `Nhập ${label.toLowerCase()} mới` : `Cập nhật ${label.toLowerCase()}`}</h2><label>Mã *<input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></label><label>Tên *<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>{tab === "criteria" ? "Mô tả" : "Mục đích"}<textarea rows={3} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label><div className="catalog-actions"><button className="button primary" disabled={busy}>Lưu</button><button type="button" className="button secondary" onClick={() => setMode("")}>Hủy</button></div></form> : row ? <><h2 style={{ marginTop: 0 }}>{row.name}</h2><p><strong>{row.code}</strong> · {row.is_active ? "Đang sử dụng" : "Đã ngưng sử dụng"}{version ? ` · v${version.version_no} (${version.status === "DRAFT" ? "Nháp" : version.status === "PUBLISHED" ? "Đã phát hành" : "Ngưng"})` : ""}</p>
      {tab === "checklist" ? <><p>Mã biểu mẫu gốc: {(row as typeof checklists[number]).source_code || "Chưa khai báo"}</p><Link href={`/monitoring/templates/${row.id}`} className="button primary">Mở bảng kiểm để cập nhật/ngưng</Link></> : <>{allowed && row.is_active ? <div className="catalog-actions">{version?.status === "DRAFT" ? <><button className="button secondary small" onClick={startEdit}>Cập nhật</button><button className="button primary small" disabled={busy} onClick={() => send("/api/catalogs", { kind: tab, action: "publish", id: row.id })}>Phát hành</button></> : <button className="button secondary small" disabled={busy} onClick={() => send("/api/catalogs", { kind: tab, action: "draft", id: row.id })}>Tạo bản nháp cập nhật</button>}<button className="button secondary small" disabled={busy} onClick={() => { if (confirm(`Ngưng sử dụng ${label.toLowerCase()} này?`)) send("/api/catalogs", { kind: tab, action: "retire", id: row.id }); }}>Ngưng sử dụng</button></div> : null}
      {tab === "criteria" && version ? <><h3>Tiêu chí và tiểu mục</h3>{allowed && version.status === "DRAFT" ? <button className="button secondary small" onClick={() => startItemEdit()}>+ Thêm tiêu chí</button> : null}
        {criteria.map(item => <div className="catalog-item" key={item.id}><strong>{item.code} · {item.title}</strong>{!item.is_active ? <span className="muted"> · Đã ngưng</span> : null}{allowed && version.status === "DRAFT" && item.is_active ? <div className="catalog-actions"><button className="button secondary small" onClick={() => startItemEdit(item)}>Cập nhật</button><button className="button secondary small" onClick={() => startItemEdit(undefined, item.id)}>+ Tiểu mục</button><button className="button secondary small" onClick={() => send("/api/catalogs/items", { action: "retire", version_id: version.id, id: item.id })}>Ngưng</button></div> : null}
          {currentItems.filter(child => child.parent_criteria_item_id === item.id).map(child => <div key={child.id} className="catalog-subitem"><strong>{child.code} · {child.title}</strong>{!child.is_active ? <span className="muted"> · Đã ngưng</span> : null}{allowed && version.status === "DRAFT" && child.is_active ? <div className="catalog-actions"><button className="button secondary small" onClick={() => startItemEdit(child)}>Cập nhật</button><button className="button secondary small" onClick={() => send("/api/catalogs/items", { action: "retire", version_id: version.id, id: child.id })}>Ngưng</button></div> : null}</div>)}</div>)}
        {itemMode && <form className="catalog-form" onSubmit={event => { event.preventDefault(); send("/api/catalogs/items", { action: itemMode, id: itemId, version_id: version.id, ...itemForm }); }}><h3>{itemMode === "create" ? "Thêm" : "Cập nhật"} {itemForm.item_type === "SUBITEM" ? "tiểu mục" : "tiêu chí"}</h3><label>Mã *<input required value={itemForm.code} onChange={event => setItemForm({ ...itemForm, code: event.target.value })} /></label><label>Tên *<input required value={itemForm.title} onChange={event => setItemForm({ ...itemForm, title: event.target.value })} /></label><label>Mô tả<textarea value={itemForm.description} onChange={event => setItemForm({ ...itemForm, description: event.target.value })} /></label><div className="catalog-actions"><button className="button primary" disabled={busy}>Lưu</button><button className="button secondary" type="button" onClick={() => setItemMode("")}>Hủy</button></div></form>}</> : null}
      {tab === "indicator" && version ? <><h3>Cách đo · v{version.version_no}</h3>{version.status === "DRAFT" && allowed ? <form className="catalog-form" onSubmit={event => { event.preventDefault(); send("/api/catalogs/indicator-version", { version_id: version.id, ...versionForm }); }}><label>Đơn vị đo *<input required value={versionForm.unit} onChange={event => setVersionForm({ ...versionForm, unit: event.target.value })} placeholder="%, ca, ngày..." /></label><label>Tần suất *<input required value={versionForm.frequency} onChange={event => setVersionForm({ ...versionForm, frequency: event.target.value })} placeholder="MONTHLY, QUARTERLY..." /></label><label>Cách tính *<input required value={versionForm.calculation_type} onChange={event => setVersionForm({ ...versionForm, calculation_type: event.target.value })} placeholder="RATIO, COUNT..." /></label><label>Chiều mong muốn<input value={versionForm.desired_direction} onChange={event => setVersionForm({ ...versionForm, desired_direction: event.target.value })} /></label><label>Hệ số<input type="number" min="0.01" step="any" value={versionForm.multiplier} onChange={event => setVersionForm({ ...versionForm, multiplier: event.target.value })} /></label><button className="button primary" disabled={busy}>Lưu cách đo</button></form> : <p>{version.calculation_type || "—"} · {version.unit || "—"} · {version.frequency || "—"}</p>}</> : null}</>}
    </> : <p className="muted">Chọn một mục bên trái để xem và cập nhật.</p>}</section></div>
  </div>;
}
