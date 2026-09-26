"use client";
import { useEffect, useState } from "react";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";

type Item = { id: string; category: string; title: string; description: string | null; status: string; created_at: string; updated_at: string };

export function EmrCategoryClient({ categoryCode, categoryLabel }: { categoryCode: string; categoryLabel: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", status: "TODO" });
  const [saving, setSaving] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryCode]);

  function openCreate() {
    setForm({ title: "", description: "", status: "TODO" });
    setCreating(true);
    setEditing(null);
  }

  function openEdit(item: Item) {
    setForm({ title: item.title, description: item.description || "", status: item.status });
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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="button primary" onClick={openCreate}>+ Thêm mục {categoryLabel.toLowerCase()}</button>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Chưa có mục nào trong &quot;{categoryLabel}&quot;. Bấm &quot;+ Thêm mục&quot; để tạo mới.</div>
      ) : (
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr><th>Tiêu đề</th><th>Mô tả</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.title}</strong></td>
                  <td>{item.description || "—"}</td>
                  <td>{EMR_STATUS_LABELS[item.status] || item.status}</td>
                  <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" className="button tertiary small" onClick={() => openEdit(item)}>Sửa</button>
                    <button type="button" className="button tertiary small" onClick={() => remove(item)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
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
              <label>Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(EMR_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
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
