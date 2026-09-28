"use client";
import { useEffect, useMemo, useState } from "react";
import { useEmrCreateSignal } from "@/components/emr-create-context";
import { Icon } from "@/components/icon";
import { EMR_CATEGORY_FIELDS, EMR_CATEGORY_KPIS, EMR_STATUS_LABELS, type EmrCategoryCode, type EmrKpiBucket } from "@/lib/emr-categories";

type Item = { id: string; category: string; title: string; description: string | null; status: string; department_id:string|null; owner_user_id:string|null; due_date: string | null; priority: string; is_go_live_gate: boolean; evidence_url: string | null; verified_at: string | null; verified_by: string | null; details: Record<string, unknown>; created_at: string; updated_at: string };

const KPI_TONE: Record<EmrKpiBucket, string> = { TOTAL: "blue", DONE: "green", IN_PROGRESS: "amber", TODO: "slate", BLOCKED: "red", OVERDUE: "red", CERT_VALID: "green", CERT_EXPIRING: "amber", CERT_EXPIRED: "red" };
const KPI_ICON: Record<EmrKpiBucket, string> = { TOTAL: "list-checks", DONE: "badge-check", IN_PROGRESS: "refresh-cw", TODO: "calendar-days", BLOCKED: "circle-alert", OVERDUE: "triangle-alert", CERT_VALID: "shield-check", CERT_EXPIRING: "triangle-alert", CERT_EXPIRED: "circle-alert" };

function todayHcm() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

function bucketCount(bucket: EmrKpiBucket, items: Item[], hasBlockedBucket: boolean): number {
  const today = todayHcm();
  switch (bucket) {
    case "TOTAL": return items.length;
    case "DONE": return items.filter((i) => i.status === "DONE").length;
    case "IN_PROGRESS": return items.filter((i) => i.status === "IN_PROGRESS").length;
    case "TODO": return items.filter((i) => i.status === "TODO" || (!hasBlockedBucket && i.status === "BLOCKED")).length;
    case "BLOCKED": return items.filter((i) => i.status === "BLOCKED").length;
    case "OVERDUE": return items.filter((i) => i.status !== "DONE" && i.due_date && i.due_date < today).length;
    case "CERT_VALID": return items.filter((i) => { const exp = i.details?.certificate_expiry; return exp && String(exp) >= today; }).length;
    case "CERT_EXPIRING": return items.filter((i) => { const exp = i.details?.certificate_expiry; if (!exp) return false; const value = String(exp); return value >= today && value <= addDays(today, 30); }).length;
    case "CERT_EXPIRED": return items.filter((i) => { const exp = i.details?.certificate_expiry; return exp && String(exp) < today; }).length;
    default: return 0;
  }
}

export function EmrCategoryClient({ categoryCode, categoryLabel, canManage }: { categoryCode: string; categoryLabel: string; canManage: boolean }) {
  const extraFields = EMR_CATEGORY_FIELDS[categoryCode as keyof typeof EMR_CATEGORY_FIELDS] || [];
  const beforeTitleFields = extraFields.filter((f) => f.showBeforeTitle);
  const afterTitleFields = extraFields.filter((f) => !f.showBeforeTitle);
  const kpis = EMR_CATEGORY_KPIS[categoryCode as EmrCategoryCode] || [];
  const hasBlockedBucket = kpis.some((k) => k.bucket === "BLOCKED");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const emptyDetails = () => Object.fromEntries(extraFields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_id:"", owner_user_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [departments,setDepartments]=useState<{id:string;name:string;short_name:string|null}[]>([]);
  const [users,setUsers]=useState<{user_id:string;full_name:string|null;email:string}[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/emr/items?category=${encodeURIComponent(categoryCode)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tải được dữ liệu.");
      setItems(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/emr/options").then(r=>r.json()).then(j=>{if(j.ok){setDepartments(j.departments||[]);setUsers(j.users||[])}}).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCode]);

  function openCreate() {
    setForm({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_id:"", owner_user_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
    setPendingFile(null);
    setCreating(true);
    setEditing(null);
  }

  const { openSignal } = useEmrCreateSignal();
  useEffect(() => {
    if (openSignal > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  function openEdit(item: Item) {
    const details: Record<string, string> = {};
    for (const f of extraFields) details[f.key] = item.details?.[f.key] != null ? String(item.details[f.key]) : "";
    setForm({ title: item.title, description: item.description || "", status: item.status, priority: item.priority || "MEDIUM", due_date: item.due_date || "", department_id:item.department_id||"", owner_user_id:item.owner_user_id||"", is_go_live_gate: !!item.is_go_live_gate, evidence_url: item.evidence_url || "", verify_completed:!!item.verified_at, details });
    setEditing(item);
    setCreating(false);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    if (!form.title.trim()) {
      window.alert("Cần nhập tiêu đề.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!editing;
      const res = await fetch(isEdit ? `/api/emr/items/${editing!.id}` : "/api/emr/items", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? form : { ...form, category: categoryCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không lưu được.");
      if (!isEdit && pendingFile && json.item?.id) {
        await uploadFile(json.item.id, pendingFile);
      }
      closeModal();
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Xoá "${item.title}"? Không thể hoàn tác.`)) return;
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được.");
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  async function viewFile(item: Item) {
    try {
      const res = await fetch(`/api/emr/items/${item.id}/file`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không mở được file.");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  const [uploading, setUploading] = useState(false);
  async function uploadFile(itemId: string, file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/emr/items/${itemId}/file`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tải lên được.");
      await load();
      setEditing((prev) => (prev && prev.id === itemId ? { ...prev, details: { ...prev.details, file_name: json.file_name } } : prev));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(itemId: string) {
    if (!window.confirm("Xoá file đính kèm này?")) return;
    try {
      const res = await fetch(`/api/emr/items/${itemId}/file`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được file.");
      await load();
      setEditing((prev) => { if (!prev || prev.id !== itemId) return prev; const d = { ...prev.details }; delete d.file_name; delete d.file_path; return { ...prev, details: d }; });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    }
  }

  const filtered = useMemo(() => { const text = search.trim().toLowerCase(); if (!text) return items; return items.filter((i) => `${i.title} ${i.description || ""}`.toLowerCase().includes(text)); }, [items, search]);

  return (
    <div className="page-stack">
      {kpis.length ? <section className="kpis" style={{ display: "grid", gridTemplateColumns: `repeat(${kpis.length},minmax(0,1fr))`, gap: 12 }}>
        {kpis.map((k) => <article className="kpi-card" key={k.bucket} style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,.03)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span className={`emr-cat-kpi-icon ${KPI_TONE[k.bucket]}`}><Icon name={KPI_ICON[k.bucket]} size={19} /></span>
          <div><div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{bucketCount(k.bucket, items, hasBlockedBucket)}</div>
          <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 600, marginTop: 2 }}>{k.label}</div></div>
        </article>)}
        <style>{`.emr-cat-kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.emr-cat-kpi-icon.blue{background:#dbeafe;color:#2563eb}.emr-cat-kpi-icon.green{background:#dcfce7;color:#16a34a}.emr-cat-kpi-icon.amber{background:#fef3c7;color:#b45309}.emr-cat-kpi-icon.red{background:#fee2e2;color:#dc2626}.emr-cat-kpi-icon.slate{background:#e2e8f0;color:#475569}`}</style>
      </section> : null}
      <div className="toolbar" style={{ padding: "0 0 4px" }}>
        <div className="toolbar-left"><div className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Tìm trong ${categoryLabel.toLowerCase()}...`} /></div></div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Chưa có mục nào trong &quot;{categoryLabel}&quot;.{canManage ? <> Bấm &quot;+ Thêm mục&quot; để tạo mới.</> : null}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Không tìm thấy mục phù hợp với &quot;{search}&quot;.</div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>#</th>{beforeTitleFields.map((f)=><th key={f.key}>{f.label}</th>)}<th>Tiêu đề</th><th>Mô tả</th>{afterTitleFields.map((f)=><th key={f.key}>{f.label}</th>)}<th>Tệp đính kèm</th><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    {beforeTitleFields.map((f)=><td key={f.key}>{item.details?.[f.key]!=null&&item.details[f.key]!==""?String(item.details[f.key]):"—"}</td>)}
                    <td><strong>{item.title}</strong></td>
                    <td>{item.description || "—"}{item.is_go_live_gate ? <div><small>Go-live gate</small></div> : null}</td>
                    {afterTitleFields.map((f)=><td key={f.key}>{item.details?.[f.key]!=null&&item.details[f.key]!==""?String(item.details[f.key]):"—"}</td>)}
                    <td>{item.details?.file_name ? <button type="button" className="button tertiary small" onClick={() => viewFile(item)}>📎 {String(item.details.file_name)}</button> : "—"}</td>
                    <td><span className={`status-badge ${item.priority==="CRITICAL"?"danger":item.priority==="HIGH"?"warning":"muted"}`}>{{LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao",CRITICAL:"Nghiêm trọng"}[item.priority]||item.priority}</span></td><td>{item.due_date || "—"}</td>
                    <td>{EMR_STATUS_LABELS[item.status] || item.status}{item.verified_at ? <div><small>Đã xác minh</small></div> : null}</td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>{canManage ? <>
                      <button type="button" className="button tertiary small" onClick={() => openEdit(item)}>Sửa</button>
                      <button type="button" className="button tertiary small" onClick={() => remove(item)}>Xoá</button>
                    </> : <small>Chỉ xem</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && (creating || editing) ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{editing ? "Sửa mục" : `Thêm mục ${categoryLabel.toLowerCase()}`}</h3></div>
            <div className="modal-body">
              <label>Tiêu đề *
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label>Mô tả
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </label>
              {extraFields.map((f) => (
                <label key={f.key}>{f.label}
                  {f.type === "select" ? (
                    <select value={form.details[f.key] || ""} onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}>
                      <option value="">— Chưa chọn —</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      value={form.details[f.key] || ""}
                      onChange={(e) => setForm({ ...form, details: { ...form.details, [f.key]: e.target.value } })}
                    />
                  )}
                </label>
              ))}

              <label>Tệp đính kèm (biểu mẫu, chứng thư, minh chứng...)
                {editing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {editing.details?.file_name ? (
                      <>
                        <button type="button" className="button tertiary small" onClick={() => viewFile(editing)}>📎 Xem: {String(editing.details.file_name)}</button>
                        <button type="button" className="button tertiary small" onClick={() => removeFile(editing.id)} disabled={uploading}>Xoá file</button>
                      </>
                    ) : (
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(editing.id, f); }} />
                    )}
                    {uploading ? <small>Đang tải lên...</small> : null}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
                    {pendingFile ? <small>Đã chọn: {pendingFile.name}</small> : null}
                  </div>
                )}
              </label>

              <label>Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Mức ưu tiên
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="CRITICAL">Nghiêm trọng</option></select>
              </label>
              <label>Khoa/phòng<select value={form.department_id} onChange={(e)=>setForm({...form,department_id:e.target.value})}><option value="">— Chưa gán —</option>{departments.map(d=><option key={d.id} value={d.id}>{d.short_name||d.name}</option>)}</select></label>
              <label>Người phụ trách<select value={form.owner_user_id} onChange={(e)=>setForm({...form,owner_user_id:e.target.value})}><option value="">— Chưa gán —</option>{users.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name||u.email}</option>)}</select></label>
              <label>Hạn hoàn thành<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
              <label className="inline-check"><input type="checkbox" checked={form.is_go_live_gate} onChange={(e) => setForm({ ...form, is_go_live_gate: e.target.checked })} /> Điều kiện bắt buộc trước Go-live</label>
              <label>Minh chứng / liên kết xác minh<input value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value, verify_completed:false })} placeholder="URL hoặc tham chiếu minh chứng" /></label>
              {editing&&form.status==="DONE"&&form.evidence_url?<label className="inline-check"><input type="checkbox" checked={form.verify_completed} onChange={(e)=>setForm({...form,verify_completed:e.target.checked})}/> Xác minh hoàn thành dựa trên minh chứng</label>:null}
            </div>
            <div className="modal-footer">
              <button type="button" className="button tertiary" onClick={closeModal} disabled={saving}>Huỷ</button>
              <button type="button" className="button primary" onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
