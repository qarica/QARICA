"use client";
import { useEffect, useState } from "react";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";

const UNGROUPED = "Chưa phân nhóm";
type TreeItem = { id: string; title: string; status: string; details: Record<string, unknown> };
type Group = { id: string; name: string; sort_order: number };

// "Nhóm gáy" is per-org master data (see supabase/migrations/20261004_emr_binding_groups_v1.sql),
// not a fixed list — this page both declares new group names into that
// catalog AND lets a manager pick/change which declared group a Biểu mẫu
// belongs to, so the tree grouping stops depending on everyone retyping the
// exact same spelling into a free-text field.
//
// Matches the real hospital example ("PL02.V2_KHTH.QT.05 — Quy định thứ tự
// dán biểu mẫu HSBA"): sheet "GÁY" declares each gáy with its own STT (sort
// order), sheet "BIỂU MẪU" numbers every form with a continuous Số TT within
// its gáy — reproduced here as emr_binding_groups.sort_order (group order)
// and details.binding_group_order (form order within its gáy).
export function EmrBieuMauTreeClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reorderingGroupId, setReorderingGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Reusing this for every post-save refresh (not just the initial mount)
  // used to flip `loading` back to true each time, which unmounted the whole
  // tree for a moment and reset the page's scroll to the top after every tick
  // — `silent` keeps the existing tree on screen while the refetch resolves.
  async function loadAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
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
      if (!opts?.silent) setLoading(false);
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
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setDeclaring(false);
    }
  }

  async function setGroupOrder(group: Group, sortOrder: number) {
    setReorderingGroupId(group.id);
    try {
      const res = await fetch(`/api/emr/binding-groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: sortOrder }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được số thứ tự nhóm gáy.");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setReorderingGroupId(null);
    }
  }

  function startRename(group: Group) { setRenamingGroupId(group.id); setRenameValue(group.name); }
  function cancelRename() { setRenamingGroupId(null); }

  async function saveRename(group: Group) {
    const name = renameValue.trim();
    if (!name) { window.alert("Tên nhóm gáy không được để trống."); return; }
    setRenaming(true);
    try {
      const res = await fetch(`/api/emr/binding-groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không đổi được tên nhóm gáy.");
      setRenamingGroupId(null);
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setRenaming(false);
    }
  }

  // Shared by group-name assignment and in-gáy order — the generic PATCH
  // route replaces `details` wholesale, so every caller sends the full
  // existing details plus the one changed key, never just the key itself.
  async function updateItemDetails(item: TreeItem, patch: Record<string, unknown>) {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: { ...item.details, ...patch } }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được.");
      await loadAll({ silent: true });
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
  const groupByName = new Map(groups.map((g) => [g.name, g]));
  // Declared groups first, ordered by their own sort_order (the real-world
  // "STT" column in sheet GÁY); undeclared free-text names (pre-dating the
  // catalog) come next alphabetically; "Chưa phân nhóm" always last.
  const sortedGroupNames = Array.from(groupMap.keys()).sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    const ga = groupByName.get(a), gb = groupByName.get(b);
    if (ga && gb) return ga.sort_order - gb.sort_order;
    if (ga) return -1;
    if (gb) return 1;
    return a.localeCompare(b, "vi");
  });
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
          const group = groupByName.get(groupName);
          // "Số TT biểu mẫu" numbers forms continuously within their own gáy —
          // items without one yet sort after numbered ones, stable by title.
          const groupItems = [...groupMap.get(groupName)!].sort((a, b) => {
            const oa = Number(a.details?.binding_group_order), ob = Number(b.details?.binding_group_order);
            const va = Number.isFinite(oa) ? oa : Infinity, vb = Number.isFinite(ob) ? ob : Infinity;
            if (va !== vb) return va - vb;
            return a.title.localeCompare(b.title, "vi");
          });
          return (
            <details key={groupName} open className="bieu-mau-tree-group">
              <summary>
                {canManage && group ? (
                  <input
                    type="number"
                    aria-label="Số thứ tự nhóm gáy"
                    value={group.sort_order}
                    disabled={reorderingGroupId === group.id}
                    onClick={(e) => e.preventDefault()}
                    onChange={(e) => setGroupOrder(group, Number(e.target.value))}
                    className="bieu-mau-tree-group-order"
                  />
                ) : null}
                {group && renamingGroupId === group.id ? (
                  <span className="bieu-mau-tree-rename" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={renaming} aria-label="Tên nhóm gáy mới" />
                    <button type="button" className="button primary small" disabled={renaming} onClick={() => saveRename(group)}>{renaming ? "..." : "Lưu"}</button>
                    <button type="button" className="button tertiary small" disabled={renaming} onClick={cancelRename}>Huỷ</button>
                  </span>
                ) : (
                  <>
                    <strong>{groupName}</strong>
                    {canManage && group ? <button type="button" className="button tertiary small" onClick={(e) => { e.preventDefault(); startRename(group); }}>Sửa tên</button> : null}
                  </>
                )}
                <span className="status-badge muted">{groupItems.length} biểu mẫu</span>
              </summary>
              <ul className="bieu-mau-tree-list">
                {groupItems.map((item) => (
                  <li key={item.id}>
                    {canManage ? (
                      <input
                        type="number"
                        aria-label="Số thứ tự biểu mẫu trong gáy"
                        title="Số thứ tự trong gáy"
                        value={item.details?.binding_group_order != null && item.details?.binding_group_order !== "" ? String(item.details.binding_group_order) : ""}
                        placeholder="STT"
                        disabled={savingId === item.id}
                        onChange={(e) => updateItemDetails(item, { binding_group_order: e.target.value })}
                        className="bieu-mau-tree-item-order"
                      />
                    ) : null}
                    <span className="bieu-mau-tree-code">{item.details?.form_code ? String(item.details.form_code) : "—"}</span>
                    <span className="bieu-mau-tree-title">{item.title}</span>
                    {canManage ? (
                      <select
                        value={groupName === UNGROUPED ? "" : groupName}
                        disabled={savingId === item.id}
                        onChange={(e) => updateItemDetails(item, { binding_group: e.target.value })}
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
      <style>{`.bieu-mau-tree-group-order{width:46px;min-height:26px;padding:2px 6px;font-size:11px;margin-right:8px}.bieu-mau-tree-item-order{width:44px;min-height:26px;padding:2px 4px;font-size:11px}.bieu-mau-tree-rename{display:inline-flex;align-items:center;gap:6px}.bieu-mau-tree-rename input{min-height:30px;font-size:12px;width:180px}`}</style>
    </>
  );
}
