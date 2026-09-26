"use client";
import { useEffect, useState } from "react";
import { EMR_CATEGORY_FIELDS, EMR_STATUS_LABELS } from "@/lib/emr-categories";

type Item = { id: string; category: string; title: string; description: string | null; status: string; department_id:string|null; owner_user_id:string|null; due_date: string | null; priority: string; is_go_live_gate: boolean; evidence_url: string | null; verified_at: string | null; details: Record<string, unknown>; created_at: string; updated_at: string };

export function EmrCategoryClient({ categoryCode, categoryLabel, canManage }: { categoryCode: string; categoryLabel: string; canManage: boolean }) {
  const extraFields = EMR_CATEGORY_FIELDS[categoryCode as keyof typeof EMR_CATEGORY_FIELDS] || [];
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const emptyDetails = () => Object.fromEntries(extraFields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState({ title: "", description: "", status: "TODO", priority: "MEDIUM", due_date: "", department_id:"", owner_user_id:"", is_go_live_gate: false, evidence_url: "", verify_completed:false, details: emptyDetails() });
  const [saving, setSaving] = useState(false);
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
    setCreating(true);
    setEditing(null);
  }

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

  return (
    <div className="page-stack">
      {canManage ? <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="button primary" onClick={openCreate}>+ Thêm mục {categoryLabel.toLowerCase()}</button>
      </div> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Chưa có mục nào trong &quot;{categoryLabel}&quot;.{canManage ? <> Bấm &quot;+ Thêm mục&quot; để tạo mới.</> : null}</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr><th>Tiêu đề</th><th>Mô tả</th>{extraFields.map((f)=><th key={f.key}>{f.label}</th>)}<th>Ưu tiên</th><th>Hạn</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.title}</strong></td>
                  <td>{item.description || "—"}{item.is_go_live_gate ? <div><small>Go-live gate</small></div> : null}</td>
                  {extraFields.map((f)=><td key={f.key}>{item.details?.[f.key]!=null&&item.details[f.key]!==""?String(item.details[f.key]):"—"}</td>)}
                  <td>{item.priority || "MEDIUM"}</td><td>{item.due_date || "—"}</td>
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
      )}

      {canManage && (creating || editing) ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Sửa mục" : `Thêm mục ${categoryLabel.toLowerCase()}`}</h3>
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
              <label><input type="checkbox" checked={form.is_go_live_gate} onChange={(e) => setForm({ ...form, is_go_live_gate: e.target.checked })} /> Điều kiện bắt buộc trước Go-live</label>
              <label>Minh chứng / liên kết xác minh<input value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value, verify_completed:false })} placeholder="URL hoặc tham chiếu minh chứng" /></label>
              {form.status==="DONE"&&form.evidence_url?<label><input type="checkbox" checked={form.verify_completed} onChange={(e)=>setForm({...form,verify_completed:e.target.checked})}/> Xác minh hoàn thành dựa trên minh chứng</label>:null}
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
