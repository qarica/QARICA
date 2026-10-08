"use client";
import { useEffect, useState } from "react";
import { EMR_STATUS_LABELS } from "@/lib/emr-categories";
import { Icon } from "@/components/icon";

const UNGROUPED = "Chưa phân nhóm";
type TreeItem = { id: string; title: string; status: string; details: Record<string, unknown> };
type Group = { id: string; name: string; code: string | null; sort_order: number; is_active: boolean };

// Live STT preview while dragging: the dragged row shows the hovered
// position, and every row between its original and hovered spot shifts by
// one to make room — same visual as any standard drag-reorder list.
function reorderedPreviewIndex(drag: { fromIndex: number; overIndex: number }, idx: number) {
  const { fromIndex, overIndex } = drag;
  if (idx === fromIndex) return overIndex;
  if (fromIndex < overIndex && idx > fromIndex && idx <= overIndex) return idx - 1;
  if (fromIndex > overIndex && idx >= overIndex && idx < fromIndex) return idx + 1;
  return idx;
}

// "Nhóm gáy" is per-org master data (see supabase/migrations/20261004_emr_binding_groups_v1.sql),
// not a fixed list. Declaring/renaming/reordering/deactivating/deleting a
// gáy is a SEPARATE concern handled on its own "Quản lý nhóm gáy" screen
// (emr-bieu-mau-groups-client.tsx) — explicit request: this tree page is
// only for organizing Biểu mẫu (assigning which gáy a form belongs to, and
// moving it up/down within that gáy), not for editing the gáy catalog
// itself directly.
//
// Matches the real hospital example ("PL02.V2_KHTH.QT.05 — Quy định thứ tự
// dán biểu mẫu HSBA"): sheet "GÁY" declares each gáy with its own STT (sort
// order, managed on the groups screen), sheet "BIỂU MẪU" numbers every form
// with a continuous Số TT within its gáy — reproduced here as
// details.binding_group_order (form order within its gáy).
//
// Each group's forms render as a real <table> (same table/th/td CSS every
// other grid in the app already uses) instead of a bare <ul><li> — the list
// previously had NO styling of its own at all, so columns never lined up.
export function EmrBieuMauTreeClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // "Nhóm gáy" per biểu mẫu used to be a bare <select onChange=...> that
  // saved the instant anh touched it — a single accidental tap could move a
  // form into the wrong gáy with no confirm step. Requested: a dedicated
  // button to enter edit mode first, mirroring the groups page's own
  // rename flow instead of editing directly.
  const [changingGroupItemId, setChangingGroupItemId] = useState<string | null>(null);
  const [pendingGroupValue, setPendingGroupValue] = useState("");
  // Drag-and-drop reorder state (replaces the old ↑/↓ buttons — explicit
  // request, since those don't work well on the phones anh/chị test with).
  // Pointer events (not HTML5 draggable) so this works with touch, not just
  // mouse. `items`/`groupName` are snapshotted at drag start since the list
  // itself doesn't change mid-drag.
  const [drag, setDrag] = useState<{ groupName: string; items: TreeItem[]; fromIndex: number; overIndex: number } | null>(null);
  const [reorderingGroup, setReorderingGroup] = useState<string | null>(null);

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

  // Shared by group-name assignment and in-gáy order — the generic PATCH
  // route replaces `details` wholesale, so every caller sends the full
  // existing details plus the one changed key, never just the key itself.
  // `onSuccess` only fires once the save actually lands, so a caller using
  // this to close its own edit-mode state leaves that state open for retry
  // if the request fails instead of closing early.
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

  // Requested: reordering a biểu mẫu within its gáy should renumber
  // automatically instead of anh typing an exact STT by hand. Renumbers the
  // WHOLE gáy sequentially (1..N) after the drop so the numbers always stay
  // clean and contiguous, regardless of whatever gaps/duplicates existed
  // before (e.g. forms that never had an order set yet).
  async function commitOrder(groupName: string, reordered: TreeItem[]) {
    setReorderingGroup(groupName);
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
      setReorderingGroup(null);
    }
  }

  function startDrag(e: React.PointerEvent, groupName: string, groupItems: TreeItem[], fromIndex: number) {
    if (reorderingGroup) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ groupName, items: groupItems, fromIndex, overIndex: fromIndex });
  }
  function onDragPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = target?.closest<HTMLElement>("tr[data-row-index]");
    if (!rowEl || rowEl.dataset.groupName !== drag.groupName) return;
    const overIndex = Number(rowEl.dataset.rowIndex);
    if (overIndex !== drag.overIndex) setDrag({ ...drag, overIndex });
  }
  async function onDragPointerUp() {
    if (!drag) return;
    const { groupName, items: groupItems, fromIndex, overIndex } = drag;
    setDrag(null);
    if (fromIndex === overIndex) return;
    const reordered = [...groupItems];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(overIndex, 0, moved);
    await commitOrder(groupName, reordered);
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
  // không hiện gáy trong cây biểu mẫu là chưa đúng" — a declared, still-
  // active gáy with zero forms assigned yet must still show up (as an empty
  // group ready to receive forms). A deactivated gáy with no forms left in
  // it, on the other hand, has nothing left to do in this tree — it only
  // reappears here if some form still points at it.
  for (const g of groups) {
    if (g.is_active && !groupMap.has(g.name)) groupMap.set(g.name, []);
  }
  const groupByName = new Map(groups.map((g) => [g.name, g]));
  // Declared groups first, ordered by their own sort_order (the real-world
  // "STT" column in sheet GÁY, managed on the groups screen); undeclared
  // free-text names (pre-dating the catalog) come next alphabetically;
  // "Chưa phân nhóm" always last.
  const sortedGroupNames = Array.from(groupMap.keys()).sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    const ga = groupByName.get(a), gb = groupByName.get(b);
    if (ga && gb) return ga.sort_order - gb.sort_order;
    if (ga) return -1;
    if (gb) return 1;
    return a.localeCompare(b, "vi");
  });
  // Offered as options for a NEW assignment: active declared groups, plus —
  // if it isn't one of those — whatever group the select is currently being
  // opened for (its current value, declared-but-deactivated or legacy free
  // text alike), so switching away from it is never blocked.
  function groupOptions(currentGroupName: string) {
    const names = groups.filter((g) => g.is_active).map((g) => g.name);
    if (currentGroupName !== UNGROUPED && !names.includes(currentGroupName)) names.push(currentGroupName);
    return names;
  }

  return (
    <>
      <div className="bieu-mau-tree-groups">
        {sortedGroupNames.map((groupName) => {
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
                <div className="bieu-mau-tree-group-name">
                  {groupByName.get(groupName)?.code ? <span className="bieu-mau-tree-group-code">{groupByName.get(groupName)!.code}</span> : null}
                  <strong>{groupName}</strong>
                </div>
                <span className="status-badge muted">{groupItems.length} biểu mẫu</span>
                {reorderingGroup === groupName ? <span className="status-badge info">Đang lưu thứ tự...</span> : null}
              </summary>
              <div className="table-wrap">
                <table className="bieu-mau-tree-table">
                  <colgroup>
                    {canManage ? <col style={{ width: 70 }} /> : null}
                    <col style={{ width: 110 }} />
                    <col style={{ width: 220 }} />
                    {canManage ? <col style={{ width: 200 }} /> : null}
                    <col style={{ width: 120 }} />
                  </colgroup>
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
                    {groupItems.map((item, idx) => {
                      const displayIdx = drag && drag.groupName === groupName ? reorderedPreviewIndex(drag, idx) : idx;
                      return (
                      <tr
                        key={item.id}
                        data-row-index={idx}
                        data-group-name={groupName}
                        className={drag?.groupName === groupName && drag.fromIndex === idx ? "bieu-mau-tree-row-dragging" : drag?.groupName === groupName && drag.overIndex === idx ? "bieu-mau-tree-row-drag-over" : ""}
                      >
                        {canManage ? (
                          <td>
                            <div className="bieu-mau-tree-order-controls">
                              <span className="bieu-mau-tree-order-value">{displayIdx + 1}</span>
                              <span
                                className="bieu-mau-tree-drag-handle"
                                role="button"
                                tabIndex={reorderingGroup ? -1 : 0}
                                aria-label="Kéo để đổi thứ tự"
                                title="Kéo để đổi thứ tự"
                                aria-disabled={!!reorderingGroup}
                                onPointerDown={(e) => startDrag(e, groupName, groupItems, idx)}
                                onPointerMove={onDragPointerMove}
                                onPointerUp={onDragPointerUp}
                                onPointerCancel={onDragPointerUp}
                              >
                                <Icon name="grip-vertical" size={16} />
                              </span>
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
                                  {groupOptions(groupName).map((name) => <option key={name} value={name}>{name}</option>)}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
      <style>{`
        .bieu-mau-tree-groups{display:flex;flex-direction:column;gap:12px}
        /* Phát hiện từ ảnh chụp thực tế trên điện thoại: cột "Tên biểu mẫu"
           vỡ chữ (xuống dòng từng chữ/âm tiết) và lệch tiêu đề cột trên màn
           hình hẹp — cùng nguyên nhân với bảng "Phạm vi áp dụng" đã sửa:
           table-layout mặc định (auto) + width:100% (kế thừa từ rule chung)
           ép bảng co vừa khung hình thay vì tràn ra và cuộn ngang. Thêm
           table-layout:fixed + colgroup (width cố định từng cột) +
           width:auto;min-width:100% để bảng tự nới đúng tổng các cột và
           tràn ra ngoài khung hẹp, .table-wrap{overflow:auto} cuộn ngang. */
        .bieu-mau-tree-table{table-layout:fixed;width:max-content;min-width:100%}
        .bieu-mau-tree-group{padding:0}
        .bieu-mau-tree-group-head{display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer}
        .bieu-mau-tree-group-name{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
        .bieu-mau-tree-group-name strong{font-size:13px}
        .bieu-mau-tree-group-code{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:7px;background:var(--brand-soft);color:var(--brand-dark);font-size:11px;font-weight:800;flex:0 0 auto}
        .bieu-mau-tree-rename{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .bieu-mau-tree-rename select{min-height:32px;font-size:12px}
        .bieu-mau-tree-order-controls{display:flex;align-items:center;gap:8px;justify-content:center}
        .bieu-mau-tree-order-value{font-weight:800;min-width:16px;text-align:center}
        .bieu-mau-tree-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;color:#8a989d;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}
        .bieu-mau-tree-drag-handle:hover{background:#f1f4f5;color:#46555c}
        .bieu-mau-tree-drag-handle[aria-disabled="true"]{cursor:not-allowed;opacity:.5}
        .bieu-mau-tree-row-dragging{opacity:.45}
        .bieu-mau-tree-row-drag-over{box-shadow:inset 0 2px 0 var(--brand),inset 0 -2px 0 var(--brand)}
        .bieu-mau-tree-group-cell{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
        .bieu-mau-tree-group-cell>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      `}</style>
    </>
  );
}
