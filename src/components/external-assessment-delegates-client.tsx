"use client";
import { useEffect, useState } from "react";

type Delegate = {
  id: string;
  sort_order: number;
  full_name: string;
  title: string | null;
  organization: string | null;
  specialty_area: string | null;
  phone: string | null;
  host_name: string | null;
  pickup_time: string | null;
  pickup_location: string | null;
  notes: string | null;
};

export function ExternalAssessmentDelegatesClient({ recordId, canManage }: { recordId: string; canManage: boolean }) {
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [specialtyArea, setSpecialtyArea] = useState("");
  const [phone, setPhone] = useState("");
  const [hostName, setHostName] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Delegate>>({});

  async function loadAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/external-assessments/${recordId}/delegates`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Không tải được danh sách đoàn thẩm định.");
      setDelegates(res.delegates || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [recordId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/external-assessments/${recordId}/delegates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          title: title.trim() || null,
          organization: organization.trim() || null,
          specialty_area: specialtyArea.trim() || null,
          phone: phone.trim() || null,
          host_name: hostName.trim() || null,
          pickup_time: pickupTime.trim() || null,
          pickup_location: pickupLocation.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không thêm được thành viên đoàn.");
      setFullName("");
      setTitle("");
      setOrganization("");
      setSpecialtyArea("");
      setPhone("");
      setHostName("");
      setPickupTime("");
      setPickupLocation("");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(d: Delegate) {
    setEditingId(d.id);
    setEditDraft({ ...d });
  }

  async function saveEdit(d: Delegate) {
    setBusyId(d.id);
    try {
      const res = await fetch(`/api/external-assessments/${recordId}/delegates/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không cập nhật được.");
      setEditingId(null);
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(d: Delegate) {
    if (!window.confirm(`Xoá thành viên đoàn "${d.full_name}"?`)) return;
    setBusyId(d.id);
    try {
      const res = await fetch(`/api/external-assessments/${recordId}/delegates/${d.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được.");
      await loadAll({ silent: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="panel empty-state">Đang tải danh sách đoàn...</div>;
  if (error) return <div className="panel alert error">Không tải được dữ liệu: {error}</div>;

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>Đoàn thẩm định / Tiếp đoàn</h2>
          <p>Danh sách thành viên đoàn và phân công nhân sự tiếp đón.</p>
        </div>
      </div>
      {canManage ? (
        <form className="ead-form" onSubmit={add}>
          <input className="input" placeholder="Họ và tên thành viên đoàn..." value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <div className="ead-form-row">
            <input className="input" placeholder="Chức danh" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="input" placeholder="Cơ quan" value={organization} onChange={(e) => setOrganization(e.target.value)} />
            <input className="input" placeholder="Danh mục/chuyên khoa phụ trách" value={specialtyArea} onChange={(e) => setSpecialtyArea(e.target.value)} />
          </div>
          <div className="ead-form-row">
            <input className="input" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="input" placeholder="Nhân sự tiếp đón" value={hostName} onChange={(e) => setHostName(e.target.value)} />
            <input className="input" placeholder="Thời gian đón" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
            <input className="input" placeholder="Địa điểm đón" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
          </div>
          <button type="submit" className="button secondary small" disabled={adding || !fullName.trim()}>
            {adding ? "Đang lưu..." : "+ Thêm thành viên đoàn"}
          </button>
        </form>
      ) : null}
      {!delegates.length ? (
        <div className="empty-state compact">Chưa có thành viên đoàn nào.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Chức danh</th>
                <th>Cơ quan</th>
                <th>Phụ trách</th>
                <th>SĐT</th>
                <th>Tiếp đón</th>
                <th>Đón lúc / tại</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {delegates.map((d) => {
                const editing = editingId === d.id;
                return (
                  <tr key={d.id}>
                    <td>{editing ? <input className="input" value={String(editDraft.full_name ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, full_name: e.target.value }))} /> : d.full_name}</td>
                    <td>{editing ? <input className="input" value={String(editDraft.title ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, title: e.target.value }))} /> : d.title || "—"}</td>
                    <td>{editing ? <input className="input" value={String(editDraft.organization ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, organization: e.target.value }))} /> : d.organization || "—"}</td>
                    <td>{editing ? <input className="input" value={String(editDraft.specialty_area ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, specialty_area: e.target.value }))} /> : d.specialty_area || "—"}</td>
                    <td>{editing ? <input className="input" value={String(editDraft.phone ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, phone: e.target.value }))} /> : d.phone || "—"}</td>
                    <td>{editing ? <input className="input" value={String(editDraft.host_name ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, host_name: e.target.value }))} /> : d.host_name || "—"}</td>
                    <td>
                      {editing ? (
                        <div className="ead-session-edit">
                          <input className="input" placeholder="Thời gian đón" value={String(editDraft.pickup_time ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, pickup_time: e.target.value }))} />
                          <input className="input" placeholder="Địa điểm đón" value={String(editDraft.pickup_location ?? "")} onChange={(e) => setEditDraft((v) => ({ ...v, pickup_location: e.target.value }))} />
                        </div>
                      ) : (
                        <small>
                          {d.pickup_time || "—"} · {d.pickup_location || "—"}
                        </small>
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        {editing ? (
                          <div className="ead-edit-actions">
                            <button type="button" className="button primary small" disabled={busyId === d.id} onClick={() => void saveEdit(d)}>
                              Lưu
                            </button>
                            <button type="button" className="button tertiary small" disabled={busyId === d.id} onClick={() => setEditingId(null)}>
                              Huỷ
                            </button>
                          </div>
                        ) : (
                          <div className="ead-edit-actions">
                            <button type="button" className="button tertiary small" disabled={busyId === d.id} onClick={() => startEdit(d)}>
                              Sửa
                            </button>
                            <button type="button" className="button tertiary small" disabled={busyId === d.id} onClick={() => void remove(d)}>
                              Xoá
                            </button>
                          </div>
                        )}
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
        .ead-form{display:grid;gap:8px;padding:0 12px 12px}
        .ead-form-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .ead-session-edit{display:grid;gap:4px;min-width:160px}
        .ead-edit-actions{display:flex;gap:6px;flex-wrap:wrap}
        @media(max-width:900px){.ead-form-row{grid-template-columns:1fr 1fr}}
      `}</style>
    </section>
  );
}
