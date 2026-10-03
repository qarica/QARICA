"use client";
import { useEffect, useState } from "react";
import type { InternalAuditType } from "@/lib/internal-audit-types";

type Item = { id: string; content: string; category: string | null; sort_order: number; is_active: boolean };

export function HsbaChecklistClient({ auditType, canManage }: { auditType: InternalAuditType; canManage: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});

  async function loadAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items?audit_type=${auditType}`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Không tải được bảng kiểm.");
      setItems(res.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [auditType]);

  async function declare(e: React.FormEvent) {
    e.preventDefault();
    const content = newContent.trim();
    if (!content) return;
    setDeclaring(true);
    try {
      const res = await fetch("/api/hsba-audit/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, category: newCategory.trim() || null, audit_type: auditType }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không thêm được tiêu chí.");
      setNewContent("");
      setNewCategory("");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setDeclaring(false);
    }
  }

  async function patch(item: Item, body: Record<string, unknown>, onSuccess?: () => void) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được tiêu chí.");
      onSuccess?.();
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditContent(item.content);
  }
  async function saveEdit(item: Item) {
    const content = editContent.trim();
    if (!content) {
      window.alert("Nội dung tiêu chí không được để trống.");
      return;
    }
    await patch(item, { content }, () => setEditingId(null));
  }

  async function toggleActive(item: Item) {
    await patch(item, { is_active: !item.is_active });
  }

  async function remove(item: Item) {
    if (!window.confirm(`Xoá tiêu chí "${item.content}"? Không thể hoàn tác.`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được tiêu chí.");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="empty-state">Đang tải...</div>;
  if (error) return <div className="alert error">Không tải được dữ liệu: {error}</div>;

  return (
    <div className="panel">
      {canManage ? (
        <form className="toolbar" onSubmit={declare} style={{ padding: "12px 12px 4px", flexWrap: "wrap", gap: 8 }}>
          <input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Nội dung tiêu chí mới..." style={{ minWidth: 280 }} />
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Phân loại (tùy chọn)" style={{ minWidth: 160 }} />
          <button type="submit" className="button secondary small" disabled={declaring || !newContent.trim()}>
            {declaring ? "Đang lưu..." : "+ Thêm tiêu chí"}
          </button>
        </form>
      ) : (
        <div className="alert" style={{ margin: "12px 12px 4px" }}>
          Tài khoản của bạn chưa có quyền &quot;Quản lý kiểm tra chất lượng HSBA&quot; nên không thể khai báo/sửa tiêu chí bảng kiểm. Liên hệ quản trị viên để được cấp quyền này trong Cấu hình hệ thống → Vai trò & Phân quyền.
        </div>
      )}
      {!items.length ? (
        <div className="empty-state">Chưa có tiêu chí nào trong bảng kiểm.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canManage ? <th style={{ width: 70 }}>STT</th> : null}
                <th>Nội dung tiêu chí</th>
                <th style={{ width: 140 }}>Phân loại</th>
                <th style={{ width: 130 }}>Trạng thái</th>
                {canManage ? <th style={{ width: 220 }}>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {canManage ? (
                    <td>
                      <input
                        type="number"
                        aria-label="Số thứ tự tiêu chí"
                        value={orderDrafts[item.id] ?? String(item.sort_order)}
                        disabled={busyId === item.id}
                        onChange={(e) => setOrderDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next) && next !== item.sort_order) patch(item, { sort_order: next });
                          setOrderDrafts((prev) => {
                            const copy = { ...prev };
                            delete copy[item.id];
                            return copy;
                          });
                        }}
                        className="bieu-mau-groups-order"
                      />
                    </td>
                  ) : null}
                  <td>
                    {editingId === item.id ? (
                      <span className="bieu-mau-groups-rename">
                        <input value={editContent} onChange={(e) => setEditContent(e.target.value)} disabled={busyId === item.id} aria-label="Nội dung tiêu chí" style={{ width: 320 }} />
                        <button type="button" className="button primary small" disabled={busyId === item.id} onClick={() => saveEdit(item)}>
                          {busyId === item.id ? "..." : "Lưu"}
                        </button>
                        <button type="button" className="button tertiary small" disabled={busyId === item.id} onClick={() => setEditingId(null)}>
                          Huỷ
                        </button>
                      </span>
                    ) : (
                      item.content
                    )}
                  </td>
                  <td>{item.category || "—"}</td>
                  <td>
                    <span className={`status-badge ${item.is_active ? "success" : "muted"}`}>{item.is_active ? "Đang dùng" : "Ngừng sử dụng"}</span>
                  </td>
                  {canManage ? (
                    <td>
                      <div className="bieu-mau-groups-actions">
                        {editingId === item.id ? null : (
                          <button type="button" className="button tertiary small" disabled={busyId === item.id} onClick={() => startEdit(item)}>
                            Sửa
                          </button>
                        )}
                        <button type="button" className="button tertiary small" disabled={busyId === item.id} onClick={() => toggleActive(item)}>
                          {item.is_active ? "Ngừng sử dụng" : "Kích hoạt lại"}
                        </button>
                        <button type="button" className="button tertiary small" disabled={busyId === item.id} onClick={() => remove(item)}>
                          Xoá
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        .bieu-mau-groups-order{width:100%;min-height:32px;padding:4px 6px;font-size:12px;text-align:center}
        .bieu-mau-groups-rename{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .bieu-mau-groups-rename input{min-height:32px;font-size:12px}
        .bieu-mau-groups-actions{display:flex;gap:6px;flex-wrap:wrap}
      `}</style>
    </div>
  );
}
