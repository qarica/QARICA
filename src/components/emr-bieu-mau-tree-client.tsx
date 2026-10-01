"use client";
import { useEffect, useState } from "react";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";

const UNGROUPED = "Chưa phân nhóm";
type TreeItem = { id: string; title: string; status: string; details: Record<string, unknown> };

// "Nhóm gáy" is per-org master data (see supabase/migrations/20261004_emr_binding_groups_v1.sql),
// not a fixed list — this page both declares new group names into that
// catalog AND lets a manager pick/change which declared group a Biểu mẫu
// belongs to, so the tree grouping stops depending on everyone retyping the
// exact same spelling into a free-text field.
export function EmrBieuMauTreeClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, groupsRes] = await Promise.all([
        fetch("/api/emr/items?category=BIEU_MAU").then((r) => r.json()),
        fetch("/api/emr/binding-groups").then((r) => r.json()),
      ]);
      if (!itemsRes.ok) throw new Error(itemsRes.error || "Không tải được dữ liệu.");
      setItems(itemsRes.items || []);
      if (groupsRes.ok) setGroups(groupsRes.groups || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function declareGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setDeclaring(true);
    try {
      const res = await fetch("/api/emr/binding-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không khai báo được nhóm gáy.");
      setNewGroupName("");
      await loadAll();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setDeclaring(false);
    }
  }

  async function assignGroup(item: TreeItem, groupName: string) {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Send the full existing details plus the one changed key — the
        // generic PATCH route replaces `details` with whatever is sent, so
        // sending only binding_group here would silently wipe every other
        // field this form already has.
        body: JSON.stringify({ details: { ...item.details, binding_group: groupName } }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được nhóm gáy.");
      await loadAll();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="empty-state">Đang tải...</div>;
  if (error) return <div className="alert error">Không tải được dữ liệu: {error}</div>;
  if (!items.length) return <div className="empty-state">Chưa có biểu mẫu nào để dựng cây.</div>;

  const groupMap = new Map<string, TreeItem[]>();
  for (const item of items) {
    const key = String(item.details?.binding_group || "").trim() || UNGROUPED;
    const list = groupMap.get(key) || [];
    list.push(item);
    groupMap.set(key, list);
  }
  const sortedGroupNames = Array.from(groupMap.keys()).sort((a, b) => a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, "vi"));
  // The select's own options must always include the item's current value
  // even if it predates the declared catalog (free text entered before this
  // feature existed), so switching it never silently discards it.
  const declaredNames = new Set(groups.map((g) => g.name));

  return (
    <>
      {canManage ? (
        <form className="toolbar" onSubmit={declareGroup} style={{ padding: "0 0 4px" }}>
          <div className="toolbar-left" style={{ gap: 8 }}>
            <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Khai báo nhóm gáy mới..." style={{ minWidth: 220 }} />
            <button type="submit" className="button secondary small" disabled={declaring || !newGroupName.trim()}>{declaring ? "Đang lưu..." : "+ Khai báo nhóm gáy"}</button>
          </div>
        </form>
      ) : null}
      <div className="panel" style={{ padding: 8 }}>
        {sortedGroupNames.map((groupName) => {
          const groupItems = groupMap.get(groupName)!;
          return (
            <details key={groupName} open className="bieu-mau-tree-group">
              <summary>
                <strong>{groupName}</strong>
                <span className="status-badge muted">{groupItems.length} biểu mẫu</span>
              </summary>
              <ul className="bieu-mau-tree-list">
                {groupItems.map((item) => (
                  <li key={item.id}>
                    <span className="bieu-mau-tree-code">{item.details?.form_code ? String(item.details.form_code) : "—"}</span>
                    <span className="bieu-mau-tree-title">{item.title}</span>
                    {canManage ? (
                      <select
                        value={groupName === UNGROUPED ? "" : groupName}
                        disabled={savingId === item.id}
                        onChange={(e) => assignGroup(item, e.target.value)}
                        style={{ minHeight: 30, fontSize: 11 }}
                        aria-label="Nhóm gáy"
                      >
                        <option value="">— Chưa phân nhóm —</option>
                        {!declaredNames.has(groupName) && groupName !== UNGROUPED ? <option value={groupName}>{groupName} (chưa khai báo)</option> : null}
                        {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                      </select>
                    ) : null}
                    <span className={`status-badge ${item.status === "DONE" ? "success" : item.status === "BLOCKED" ? "danger" : "muted"}`}>{EMR_STATUS_LABELS[item.status] || item.status}</span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </>
  );
}
