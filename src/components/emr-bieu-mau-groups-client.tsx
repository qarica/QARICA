"use client";
import { useEffect, useState } from "react";

type Group = { id: string; name: string; code: string | null; sort_order: number; is_active: boolean };
type Item = { id: string; details: Record<string, unknown>; publish_status: string };

// Dedicated "Quản lý nhóm gáy" screen — declare/rename/reorder/deactivate/
// delete the Nhóm gáy catalog itself. Split out from the master tree page
// (emr-bieu-mau-tree-client.tsx) per explicit request: that tree is only for
// reordering Biểu mẫu up/down within their gáy, not for editing the gáy
// catalog directly — mixing the two made it look like the tree itself owned
// group names, when the catalog (emr_binding_groups) is the real source.
export function EmrBieuMauGroupsClient({ canManage }: { canManage: boolean }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});

  async function loadAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [groupsRes, itemsRes] = await Promise.all([
        fetch("/api/emr/binding-groups").then((r) => r.json()),
        fetch("/api/emr/items?category=BIEU_MAU").then((r) => r.json()),
      ]);
      if (!groupsRes.ok) throw new Error(groupsRes.error || "Không tải được danh sách nhóm gáy.");
      setGroups(groupsRes.groups || []);
      if (itemsRes.ok) setItems(itemsRes.items || []);
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
      const res = await fetch("/api/emr/binding-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code: newGroupCode.trim() || null }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không khai báo được nhóm gáy.");
      setNewGroupName("");
      setNewGroupCode("");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setDeclaring(false);
    }
  }

  async function patchGroup(group: Group, patch: Record<string, unknown>, onSuccess?: () => void) {
    setBusyId(group.id);
    try {
      const res = await fetch(`/api/emr/binding-groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được nhóm gáy.");
      onSuccess?.();
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  function startRename(group: Group) { setRenamingId(group.id); setRenameValue(group.name); }
  function cancelRename() { setRenamingId(null); }
  async function saveRename(group: Group) {
    const name = renameValue.trim();
    if (!name) { window.alert("Tên nhóm gáy không được để trống."); return; }
    await patchGroup(group, { name }, () => setRenamingId(null));
  }

  async function toggleActive(group: Group) {
    await patchGroup(group, { is_active: !group.is_active });
  }

  async function deleteGroup(group: Group, itemCount: number) {
    if (itemCount > 0) { window.alert(`Còn ${itemCount} biểu mẫu đang thuộc nhóm gáy này — chuyển biểu mẫu sang nhóm khác hoặc ngừng sử dụng thay vì xoá.`); return; }
    if (!window.confirm(`Xoá nhóm gáy "${group.name}"? Không thể hoàn tác.`)) return;
    setBusyId(group.id);
    try {
      const res = await fetch(`/api/emr/binding-groups/${group.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được nhóm gáy.");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="empty-state">Đang tải...</div>;
  if (error) return <div className="alert error">Không tải được dữ liệu: {error}</div>;

  // Tự rà sau khi "Cây biểu mẫu" đổi sang chỉ đếm biểu mẫu ĐÃ duyệt phát
  // hành: trang này (link ngay trên cùng "Cây biểu mẫu") trước đó đếm MỌI
  // biểu mẫu bất kể publish_status, nên 1 nhóm gáy có thể hiện số khác nhau
  // giữa 2 màn hình liền kề. Hiện số ĐÃ DUYỆT (khớp với Cây biểu mẫu) làm số
  // chính, kèm số Nháp riêng nếu có — nhưng nút "Xoá" vẫn phải chặn theo
  // TỔNG (kể cả Nháp), vì xoá nhóm vẫn làm mồ côi binding_group của biểu mẫu
  // Nháp đang trỏ tới nó.
  const publishedCountByName = new Map<string, number>();
  const draftCountByName = new Map<string, number>();
  for (const item of items) {
    const key = String(item.details?.binding_group || "").trim();
    if (!key) continue;
    if (item.publish_status === "DRAFT") draftCountByName.set(key, (draftCountByName.get(key) || 0) + 1);
    else publishedCountByName.set(key, (publishedCountByName.get(key) || 0) + 1);
  }

  return (
    <div className="panel">
      {canManage ? (
        <form className="toolbar" onSubmit={declareGroup} style={{ padding: "12px 12px 4px" }}>
          <div className="toolbar-left" style={{ gap: 8 }}>
            <input value={newGroupCode} onChange={(e) => setNewGroupCode(e.target.value)} placeholder="Mã (vd: V)" style={{ width: 90 }} aria-label="Mã nhóm gáy" />
            <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Khai báo nhóm gáy mới..." style={{ minWidth: 220 }} />
            <button type="submit" className="button secondary small" disabled={declaring || !newGroupName.trim()}>{declaring ? "Đang lưu..." : "+ Khai báo nhóm gáy"}</button>
          </div>
        </form>
      ) : null}
      {!groups.length ? (
        <div className="empty-state">Chưa khai báo nhóm gáy nào.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canManage ? <th style={{ width: 70 }}>STT</th> : null}
                <th style={{ width: 90 }}>Mã nhóm</th>
                <th>Tên nhóm gáy</th>
                <th style={{ width: 120 }}>Số biểu mẫu</th>
                <th style={{ width: 130 }}>Trạng thái</th>
                {canManage ? <th style={{ width: 220 }}>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const publishedCount = publishedCountByName.get(group.name) || 0;
                const draftCount = draftCountByName.get(group.name) || 0;
                const totalCount = publishedCount + draftCount;
                return (
                  <tr key={group.id}>
                    {canManage ? (
                      <td>
                        <input
                          type="number"
                          aria-label="Số thứ tự nhóm gáy"
                          value={orderDrafts[group.id] ?? String(group.sort_order)}
                          disabled={busyId === group.id}
                          onChange={(e) => setOrderDrafts((prev) => ({ ...prev, [group.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isFinite(next) && next !== group.sort_order) patchGroup(group, { sort_order: next });
                            setOrderDrafts((prev) => { const copy = { ...prev }; delete copy[group.id]; return copy; });
                          }}
                          className="bieu-mau-groups-order"
                        />
                      </td>
                    ) : null}
                    <td>
                      {canManage ? (
                        <input
                          aria-label="Mã nhóm gáy"
                          value={codeDrafts[group.id] ?? (group.code || "")}
                          disabled={busyId === group.id}
                          onChange={(e) => setCodeDrafts((prev) => ({ ...prev, [group.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next !== (group.code || "")) patchGroup(group, { code: next || null });
                            setCodeDrafts((prev) => { const copy = { ...prev }; delete copy[group.id]; return copy; });
                          }}
                          className="bieu-mau-groups-order"
                        />
                      ) : (
                        group.code || "—"
                      )}
                    </td>
                    <td>
                      {renamingId === group.id ? (
                        <span className="bieu-mau-groups-rename">
                          <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={busyId === group.id} aria-label="Tên nhóm gáy mới" />
                          <button type="button" className="button primary small" disabled={busyId === group.id} onClick={() => saveRename(group)}>{busyId === group.id ? "..." : "Lưu"}</button>
                          <button type="button" className="button tertiary small" disabled={busyId === group.id} onClick={cancelRename}>Huỷ</button>
                        </span>
                      ) : (
                        <strong>{group.name}</strong>
                      )}
                    </td>
                    <td>{publishedCount}{draftCount > 0 ? <div><small className="muted">+{draftCount} Nháp</small></div> : null}</td>
                    <td><span className={`status-badge ${group.is_active ? "success" : "muted"}`}>{group.is_active ? "Đang dùng" : "Ngừng sử dụng"}</span></td>
                    {canManage ? (
                      <td>
                        <div className="bieu-mau-groups-actions">
                          {renamingId === group.id ? null : <button type="button" className="button tertiary small" disabled={busyId === group.id} onClick={() => startRename(group)}>Sửa tên</button>}
                          <button type="button" className="button tertiary small" disabled={busyId === group.id} onClick={() => toggleActive(group)}>{group.is_active ? "Ngừng sử dụng" : "Kích hoạt lại"}</button>
                          <button type="button" className="button tertiary small" disabled={busyId === group.id || totalCount > 0} title={totalCount > 0 ? "Còn biểu mẫu thuộc nhóm này (kể cả Nháp) — chuyển nhóm hoặc ngừng sử dụng trước" : undefined} onClick={() => deleteGroup(group, totalCount)}>Xoá</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        .bieu-mau-groups-order{width:100%;min-height:32px;padding:4px 6px;font-size:12px;text-align:center}
        .bieu-mau-groups-rename{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .bieu-mau-groups-rename input{min-height:32px;font-size:12px;width:200px}
        .bieu-mau-groups-actions{display:flex;gap:6px;flex-wrap:wrap}
      `}</style>
    </div>
  );
}
