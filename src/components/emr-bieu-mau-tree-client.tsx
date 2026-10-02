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
//
// Each group's forms render as a real <table> (same table/th/td CSS every
// other grid in the app already uses) instead of a bare <ul><li> — the list
// previously had NO styling of its own at all, so columns never lined up.
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
  // Saving a number input on every keystroke (onChange) fired a network
  // round-trip per digit, which refreshed the list mid-typing and made
  // multi-digit numbers almost impossible to type. This holds the in-progress
  // text locally and only saves once anh rời khỏi ô nhập (onBlur), and only if
  // the value actually changed. (Only the group's own STT still uses a typed
  // number — the in-gáy form order was replaced by move up/down buttons,
  // see moveItemOrder below.)
  const [groupOrderDrafts, setGroupOrderDrafts] = useState<Record<string, string>>({});
  // "Nhóm gáy" per biểu mẫu used to be a bare <select onChange=...> that
  // saved the instant anh touched it — a single accidental tap could move a
  // form into the wrong gáy with no confirm step. Requested: a dedicated
  // button to enter edit mode first, mirroring the existing rename flow
  // (startRename/saveRename below) instead of editing directly.
  const [changingGroupItemId, setChangingGroupItemId] = useState<string | null>(null);
  const [pendingGroupValue, setPendingGroupValue] = useState("");

  // Post-save refreshes stay silent (no loading flash) so the page doesn't
  // unmount the whole tree and reset the page's scroll to the top after
  // every single tick/edit.
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
  // `onSuccess` only fires once the save actually lands (mirrors saveRename
  // below), so a caller using this to close its own edit-mode state leaves
  // that state open for retry if the request fails instead of closing early.
  async function updateItemDetails(item: TreeItem, patch: Record<string, unknown>, onSuccess?: () => void) {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/emr/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: { ...item.details, ...patch } }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được.");
      onSuccess?.();
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSavingId(null);
    }
  }

  function startChangeGroup(item: TreeItem, currentGroupName: string) { setChangingGroupItemId(item.id); setPendingGroupValue(currentGroupName === UNGROUPED ? "" : currentGroupName); }
  function cancelChangeGroup() { setChangingGroupItemId(null); }
  async function saveChangeGroup(item: TreeItem) {
    await updateItemDetails(item, { binding_group: pendingGroupValue }, () => setChangingGroupItemId(null));
  }

  // Requested: moving a biểu mẫu up/down within its gáy should renumber
  // automatically instead of anh typing an exact STT by hand. Renumbers the
  // WHOLE gáy sequentially (1..N) after the swap so the numbers always stay
  // clean and contiguous, regardless of whatever gaps/duplicates existed
  // before (e.g. forms that never had an order set yet).
  async function moveItemOrder(groupItems: TreeItem[], item: TreeItem, direction: "up" | "down") {
    const idx = groupItems.findIndex((i) => i.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= groupItems.length) return;
    const reordered = [...groupItems];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setSavingId(item.id);
    try {
      for (const [i, it] of reordered.entries()) {
        const newOrder = i + 1;
        const current = Number(it.details?.binding_group_order);
        if (current === newOrder) continue;
        const res = await fetch(`/api/emr/items/${it.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ details: { ...it.details, binding_group_order: newOrder } }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được thứ tự.");
      }
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="empty-state">Đang tải...</div>;
  if (error) return <div className="alert error">Không tải được dữ liệu: {error}</div>;
  if (!items.length && !groups.length) return <div className="empty-state">Chưa có biểu mẫu nào để dựng cây.</div>;

  const groupMap = new Map<string, TreeItem[]>();
  for (const item of items) {
    const key = String(item.details?.binding_group || "").trim() || UNGROUPED;
    const list = groupMap.get(key) || [];
    list.push(item);
    groupMap.set(key, list);
  }
  // Requested: "có 1 số gáy đã khai báo nhưng chưa có biểu mẫu trong đó nên
  // không hiện gáy trong cây biểu mẫu là chưa đúng" — a declared gáy with
  // zero forms assigned yet must still show up (as an empty group ready to
  // receive forms), not stay invisible until its first form is assigned.
  for (const g of groups) {
    if (!groupMap.has(g.name)) groupMap.set(g.name, []);
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
      <div className="bieu-mau-tree-groups">
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
            <details key={groupName} open className="panel bieu-mau-tree-group">
              <summary className="bieu-mau-tree-group-head">
                {canManage && group ? (
                  <label className="bieu-mau-tree-group-order" onClick={(e) => e.preventDefault()}>
                    <span>STT nhóm</span>
                    <input
                      type="number"
                      aria-label="Số thứ tự nhóm gáy"
                      value={groupOrderDrafts[group.id] ?? String(group.sort_order)}
                      disabled={reorderingGroupId === group.id}
                      onChange={(e) => setGroupOrderDrafts((prev) => ({ ...prev, [group.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next) && next !== group.sort_order) setGroupOrder(group, next);
                        setGroupOrderDrafts((prev) => { const copy = { ...prev }; delete copy[group.id]; return copy; });
                      }}
                    />
                  </label>
                ) : null}
                <div className="bieu-mau-tree-group-name">
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
                </div>
                <span className="status-badge muted">{groupItems.length} biểu mẫu</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {canManage ? <th style={{ width: 70 }}>STT</th> : null}
                      <th style={{ width: 110 }}>Mã biểu mẫu</th>
                      <th>Tên biểu mẫu</th>
                      {canManage ? <th style={{ width: 200 }}>Nhóm gáy</th> : null}
                      <th style={{ width: 120 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupItems.length === 0 ? (
                      <tr><td colSpan={canManage ? 5 : 3} className="empty-state" style={{ padding: "14px 12px" }}>Chưa có biểu mẫu nào trong nhóm gáy này.</td></tr>
                    ) : null}
                    {groupItems.map((item, idx) => (
                      <tr key={item.id}>
                        {canManage ? (
                          <td>
                            <div className="bieu-mau-tree-order-controls">
                              <span className="bieu-mau-tree-order-value">{idx + 1}</span>
                              <div className="bieu-mau-tree-order-buttons">
                                <button type="button" className="button tertiary small" disabled={savingId === item.id || idx === 0} onClick={() => moveItemOrder(groupItems, item, "up")} aria-label="Di chuyển lên" title="Di chuyển lên">↑</button>
                                <button type="button" className="button tertiary small" disabled={savingId === item.id || idx === groupItems.length - 1} onClick={() => moveItemOrder(groupItems, item, "down")} aria-label="Di chuyển xuống" title="Di chuyển xuống">↓</button>
                              </div>
                            </div>
                          </td>
                        ) : null}
                        <td>{item.details?.form_code ? String(item.details.form_code) : "—"}</td>
                        <td>{item.title}</td>
                        {canManage ? (
                          <td>
                            {changingGroupItemId === item.id ? (
                              <span className="bieu-mau-tree-rename">
                                <select value={pendingGroupValue} disabled={savingId === item.id} onChange={(e) => setPendingGroupValue(e.target.value)} aria-label="Nhóm gáy mới">
                                  <option value="">— Chưa phân nhóm —</option>
                                  {!declaredNames.has(groupName) && groupName !== UNGROUPED ? <option value={groupName}>{groupName} (chưa khai báo)</option> : null}
                                  {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                                </select>
                                <button type="button" className="button primary small" disabled={savingId === item.id} onClick={() => saveChangeGroup(item)}>{savingId === item.id ? "..." : "Lưu"}</button>
                                <button type="button" className="button tertiary small" disabled={savingId === item.id} onClick={cancelChangeGroup}>Huỷ</button>
                              </span>
                            ) : (
                              <span className="bieu-mau-tree-group-cell">
                                <span>{groupName === UNGROUPED ? "— Chưa phân nhóm —" : groupName}</span>
                                <button type="button" className="button tertiary small" onClick={() => startChangeGroup(item, groupName)}>Đổi nhóm</button>
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td><span className={`status-badge ${item.status === "DONE" ? "success" : item.status === "BLOCKED" ? "danger" : "muted"}`}>{EMR_STATUS_LABELS[item.status] || item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
      <style>{`
        .bieu-mau-tree-groups{display:flex;flex-direction:column;gap:12px}
        .bieu-mau-tree-group{padding:0}
        .bieu-mau-tree-group-head{display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer}
        .bieu-mau-tree-group-order{display:flex;flex-direction:column;gap:2px;font-size:9px;font-weight:700;color:#7b8b91;text-transform:uppercase}
        .bieu-mau-tree-group-order input{width:60px;min-height:32px;padding:4px 6px;font-size:12px}
        .bieu-mau-tree-group-name{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
        .bieu-mau-tree-group-name strong{font-size:13px}
        .bieu-mau-tree-rename{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .bieu-mau-tree-rename input,.bieu-mau-tree-rename select{min-height:32px;font-size:12px}
        .bieu-mau-tree-rename input{width:200px}
        .bieu-mau-tree-order-controls{display:flex;align-items:center;gap:6px;justify-content:center}
        .bieu-mau-tree-order-value{font-weight:800;min-width:16px;text-align:center}
        .bieu-mau-tree-order-buttons{display:flex;flex-direction:column;gap:2px}
        .bieu-mau-tree-order-buttons button{min-height:0;padding:1px 6px;line-height:1.3}
        .bieu-mau-tree-group-cell{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
        .bieu-mau-tree-group-cell>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      `}</style>
    </>
  );
}
