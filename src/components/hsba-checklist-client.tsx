"use client";
import { useEffect, useState } from "react";
import type { InternalAuditType } from "@/lib/internal-audit-types";
import { CHECKLIST_VERSION_STATUS_LABEL, type ChecklistTemplateSummary } from "@/lib/hsba-checklist-template-types";

type Item = { id: string; content: string; category: string | null; sort_order: number; is_active: boolean };

export function HsbaChecklistClient({ auditType, canManage }: { auditType: InternalAuditType; canManage: boolean }) {
  const [templates, setTemplates] = useState<ChecklistTemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;
  const activeVersion = selectedTemplate?.draft_version || selectedTemplate?.published_version || null;
  const canEditItems = canManage && activeVersion?.status === "DRAFT";

  async function loadTemplates(opts?: { silent?: boolean; keepSelection?: boolean }) {
    if (!opts?.silent) setLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-templates?audit_type=${auditType}`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Không tải được danh sách mẫu bảng kiểm.");
      const list: ChecklistTemplateSummary[] = res.templates || [];
      setTemplates(list);
      if (!opts?.keepSelection) {
        setSelectedTemplateId((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id || null));
      }
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      if (!opts?.silent) setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditType]);

  async function loadItems(versionId: string, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoadingItems(true);
    setItemsError(null);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items?checklist_version_id=${versionId}`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Không tải được tiêu chí.");
      setItems(res.items || []);
    } catch (e) {
      setItemsError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      if (!opts?.silent) setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (activeVersion?.id) loadItems(activeVersion.id);
    else setItems([]);
  }, [activeVersion?.id]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    const name = newTemplateName.trim();
    if (!name) return;
    setCreatingTemplate(true);
    try {
      const res = await fetch("/api/hsba-audit/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_type: auditType, name, description: newTemplateDescription.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tạo được mẫu bảng kiểm.");
      setNewTemplateName("");
      setNewTemplateDescription("");
      setSelectedTemplateId(json.template.id);
      await loadTemplates({ silent: true, keepSelection: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function cloneVersion() {
    if (!selectedTemplate) return;
    setTemplateBusy(true);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-templates/${selectedTemplate.id}/versions`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không tạo được phiên bản nháp mới.");
      await loadTemplates({ silent: true, keepSelection: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function publishVersion() {
    if (!selectedTemplate || !activeVersion) return;
    if (!window.confirm(`Phát hành phiên bản ${activeVersion.version_no}? Lượt kiểm tra mới sẽ dùng phiên bản này.`)) return;
    setTemplateBusy(true);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-templates/${selectedTemplate.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: activeVersion.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không phát hành được phiên bản.");
      await loadTemplates({ silent: true, keepSelection: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function declare(e: React.FormEvent) {
    e.preventDefault();
    const content = newContent.trim();
    if (!content || !activeVersion) return;
    setDeclaring(true);
    try {
      const res = await fetch("/api/hsba-audit/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, category: newCategory.trim() || null, checklist_version_id: activeVersion.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không thêm được tiêu chí.");
      setNewContent("");
      setNewCategory("");
      await loadItems(activeVersion.id, { silent: true });
      await loadTemplates({ silent: true, keepSelection: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setDeclaring(false);
    }
  }

  async function patch(item: Item, body: Record<string, unknown>, onSuccess?: () => void) {
    if (!activeVersion) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được tiêu chí.");
      onSuccess?.();
      await loadItems(activeVersion.id, { silent: true });
      await loadTemplates({ silent: true, keepSelection: true });
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
    if (!activeVersion) return;
    if (!window.confirm(`Xoá tiêu chí "${item.content}"? Không thể hoàn tác.`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/hsba-audit/checklist-items/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được tiêu chí.");
      await loadItems(activeVersion.id, { silent: true });
      await loadTemplates({ silent: true, keepSelection: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  if (loadingTemplates) return <div className="empty-state">Đang tải...</div>;
  if (templatesError) return <div className="alert error">Không tải được dữ liệu: {templatesError}</div>;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 260px", minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Mẫu bảng kiểm</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTemplateId(t.id)}
                className="button tertiary small"
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  background: t.id === selectedTemplateId ? "#eff6ff" : "transparent",
                  color: t.id === selectedTemplateId ? "#1d4ed8" : undefined,
                }}
              >
                {t.name}
                {!t.is_active ? " (Ngừng dùng)" : ""}
                {!t.published_version ? " · Chưa phát hành" : ""}
              </button>
            ))}
            {!templates.length ? <div className="empty-state compact">Chưa có mẫu bảng kiểm nào.</div> : null}
          </div>
          {canManage ? (
            <form onSubmit={createTemplate} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Tên mẫu bảng kiểm mới..." />
              <input value={newTemplateDescription} onChange={(e) => setNewTemplateDescription(e.target.value)} placeholder="Mô tả (tùy chọn)" />
              <button type="submit" className="button secondary small" disabled={creatingTemplate || !newTemplateName.trim()}>
                {creatingTemplate ? "Đang tạo..." : "+ Tạo mẫu mới"}
              </button>
            </form>
          ) : null}
        </div>

        <div style={{ flex: "1 1 400px", minWidth: 280 }}>
          {!selectedTemplate ? (
            <div className="empty-state">Chọn một mẫu bảng kiểm để xem/sửa tiêu chí.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <strong>{selectedTemplate.name}</strong>
                {activeVersion ? (
                  <span className={`status-badge ${activeVersion.status === "PUBLISHED" ? "success" : "muted"}`}>
                    Phiên bản {activeVersion.version_no} — {CHECKLIST_VERSION_STATUS_LABEL[activeVersion.status]}
                  </span>
                ) : (
                  <span className="status-badge muted">Chưa có phiên bản</span>
                )}
                {canManage && selectedTemplate.draft_version === null ? (
                  <button type="button" className="button tertiary small" disabled={templateBusy} onClick={cloneVersion}>
                    {templateBusy ? "..." : "Tạo phiên bản mới để sửa"}
                  </button>
                ) : null}
                {canManage && activeVersion?.status === "DRAFT" ? (
                  <button type="button" className="button primary small" disabled={templateBusy || !activeVersion.item_count} onClick={publishVersion}>
                    {templateBusy ? "..." : "Phát hành phiên bản này"}
                  </button>
                ) : null}
              </div>
              {activeVersion?.status === "PUBLISHED" ? (
                <div className="alert" style={{ marginBottom: 10 }}>
                  Đây là phiên bản đã phát hành — không thể sửa trực tiếp. Bấm &quot;Tạo phiên bản mới để sửa&quot; để tạo bản Nháp sao chép từ phiên bản này.
                </div>
              ) : null}

              {canEditItems ? (
                <form className="toolbar" onSubmit={declare} style={{ padding: "0 0 8px", flexWrap: "wrap", gap: 8 }}>
                  <input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Nội dung tiêu chí mới..." style={{ minWidth: 240 }} />
                  <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Phân loại (tùy chọn)" style={{ minWidth: 140 }} />
                  <button type="submit" className="button secondary small" disabled={declaring || !newContent.trim()}>
                    {declaring ? "Đang lưu..." : "+ Thêm tiêu chí"}
                  </button>
                </form>
              ) : !canManage ? (
                <div className="alert" style={{ marginBottom: 10 }}>
                  Tài khoản của bạn chưa có quyền &quot;Quản lý kiểm tra chất lượng HSBA&quot; nên không thể khai báo/sửa tiêu chí bảng kiểm. Liên hệ quản trị viên để được cấp quyền này trong Cấu hình hệ thống → Vai trò &amp; Phân quyền.
                </div>
              ) : null}

              {loadingItems ? (
                <div className="empty-state">Đang tải...</div>
              ) : itemsError ? (
                <div className="alert error">Không tải được dữ liệu: {itemsError}</div>
              ) : !items.length ? (
                <div className="empty-state">Chưa có tiêu chí nào trong phiên bản này.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {canEditItems ? <th style={{ width: 70 }}>STT</th> : null}
                        <th>Nội dung tiêu chí</th>
                        <th style={{ width: 140 }}>Phân loại</th>
                        <th style={{ width: 130 }}>Trạng thái</th>
                        {canEditItems ? <th style={{ width: 220 }}>Thao tác</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          {canEditItems ? (
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
                          {canEditItems ? (
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
            </>
          )}
        </div>
      </div>
      <style>{`
        .bieu-mau-groups-order{width:100%;min-height:32px;padding:4px 6px;font-size:12px;text-align:center}
        .bieu-mau-groups-rename{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .bieu-mau-groups-rename input{min-height:32px;font-size:12px}
        .bieu-mau-groups-actions{display:flex;gap:6px;flex-wrap:wrap}
      `}</style>
    </div>
  );
}
