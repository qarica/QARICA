"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Training = {
  id: string;
  procedure_code: string | null;
  procedure_name: string;
  drafting_unit: string | null;
  effective_date: string | null;
  trainer: string | null;
  session_1_time: string | null;
  session_1_location: string | null;
  session_1_method: string | null;
  status: "TRAINED" | "PLANNED" | "NOT_PLANNED";
  feedback_qlcl: string | null;
  session_2_time: string | null;
  session_2_location: string | null;
  session_2_method: string | null;
  notes: string | null;
  attendee_total: number;
  attendee_attended: number;
};

type Attendee = {
  id: string;
  training_id: string;
  employee_name: string;
  employee_code: string | null;
  attended: boolean;
  attended_at: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  TRAINED: "Đã đào tạo",
  PLANNED: "Chưa đào tạo — đã có kế hoạch",
  NOT_PLANNED: "Chưa đào tạo — chưa có kế hoạch",
};
const STATUS_TONE: Record<string, string> = { TRAINED: "success", PLANNED: "warning", NOT_PLANNED: "danger" };

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

export function ProcedureTrainingsClient({ initialTrainings, canManage }: { initialTrainings: Training[]; canManage: boolean }) {
  const [trainings, setTrainings] = useState(initialTrainings);
  const [procedureCode, setProcedureCode] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [draftingUnit, setDraftingUnit] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Training>>({});
  const [rosterTraining, setRosterTraining] = useState<Training | null>(null);
  const [rosterAttendees, setRosterAttendees] = useState<Attendee[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeCode, setNewEmployeeCode] = useState("");

  async function submit() {
    if (!procedureName.trim()) {
      setError("Chưa nhập tên quy trình.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/procedure-trainings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        procedure_code: procedureCode.trim() || null,
        procedure_name: procedureName.trim(),
        drafting_unit: draftingUnit.trim() || null,
        effective_date: effectiveDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setTrainings((v) => [body.training as Training, ...v]);
    setProcedureCode("");
    setProcedureName("");
    setDraftingUnit("");
    setEffectiveDate("");
  }

  function startEdit(t: Training) {
    setEditingId(t.id);
    setEditDraft({
      trainer: t.trainer || "",
      session_1_time: t.session_1_time || "",
      session_1_location: t.session_1_location || "",
      session_1_method: t.session_1_method || "",
      status: t.status,
      feedback_qlcl: t.feedback_qlcl || "",
      session_2_time: t.session_2_time || "",
      session_2_location: t.session_2_location || "",
      session_2_method: t.session_2_method || "",
      notes: t.notes || "",
    });
  }

  async function saveEdit(t: Training) {
    setError("");
    const res = await fetch(`/api/procedure-trainings/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setTrainings((v) => v.map((x) => (x.id === t.id ? { ...x, ...body.training } : x)));
    setEditingId(null);
  }

  function openRoster(t: Training) {
    setRosterTraining(t);
    setRosterError("");
    setNewEmployeeName("");
    setNewEmployeeCode("");
  }

  function closeRoster() {
    setRosterTraining(null);
    setRosterAttendees([]);
  }

  function syncRosterCounts(trainingId: string, list: Attendee[]) {
    const total = list.length;
    const attended = list.filter((a) => a.attended).length;
    setTrainings((v) => v.map((x) => (x.id === trainingId ? { ...x, attendee_total: total, attendee_attended: attended } : x)));
  }

  useEffect(() => {
    if (!rosterTraining) return;
    let cancelled = false;
    setRosterLoading(true);
    fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setRosterAttendees((body.attendees as Attendee[]) || []);
      })
      .catch(() => {
        if (!cancelled) setRosterError("Không tải được danh sách nhân sự.");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rosterTraining]);

  async function addAttendee() {
    if (!rosterTraining || !newEmployeeName.trim()) return;
    setRosterError("");
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_name: newEmployeeName.trim(), employee_code: newEmployeeCode.trim() || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRosterError(body.error || "Không thêm được nhân sự.");
      return;
    }
    const next = [...rosterAttendees, body.attendee as Attendee];
    setRosterAttendees(next);
    syncRosterCounts(rosterTraining.id, next);
    setNewEmployeeName("");
    setNewEmployeeCode("");
  }

  async function toggleAttended(attendee: Attendee) {
    if (!rosterTraining) return;
    setRosterError("");
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees/${attendee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attended: !attendee.attended }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRosterError(body.error || "Không cập nhật được.");
      return;
    }
    const next = rosterAttendees.map((a) => (a.id === attendee.id ? (body.attendee as Attendee) : a));
    setRosterAttendees(next);
    syncRosterCounts(rosterTraining.id, next);
  }

  async function removeAttendee(attendee: Attendee) {
    if (!rosterTraining) return;
    setRosterError("");
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees/${attendee.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRosterError(body.error || "Không xóa được.");
      return;
    }
    const next = rosterAttendees.filter((a) => a.id !== attendee.id);
    setRosterAttendees(next);
    syncRosterCounts(rosterTraining.id, next);
  }

  const rosterModal = rosterTraining && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 18, display: "grid", placeItems: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) closeRoster(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="roster-title" className="modal-card" style={{ width: "min(560px, calc(100vw - 36px))", maxHeight: "calc(100vh - 48px)", overflow: "auto" }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">NHÂN SỰ ĐÀO TẠO</div>
            <h2 id="roster-title">{rosterTraining.procedure_name}</h2>
          </div>
          <button className="icon-button" onClick={closeRoster} aria-label="Đóng">×</button>
        </div>
        <div style={{ padding: "0 20px 20px", display: "grid", gap: 12 }}>
          {rosterError ? <div className="alert error">{rosterError}</div> : null}
          {canManage ? (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
              <input className="input" placeholder="Tên nhân viên..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
              <input className="input" placeholder="Mã NV (tùy chọn)" value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} />
              <button className="button primary small" disabled={!newEmployeeName.trim()} onClick={() => void addAttendee()}>
                + Thêm
              </button>
            </div>
          ) : null}
          {rosterLoading ? (
            <div className="muted">Đang tải...</div>
          ) : (
            <div className="work-list">
              {rosterAttendees.map((a) => (
                <div className="work-row" key={a.id}>
                  <div className="work-main">
                    <strong>
                      {a.employee_name}
                      {a.employee_code ? ` (${a.employee_code})` : ""}
                    </strong>
                    <small>{a.attended ? `Đã đào tạo${a.attended_at ? ` · ${formatDate(a.attended_at)}` : ""}` : "Chưa đào tạo"}</small>
                  </div>
                  {canManage ? (
                    <>
                      <label className="inline-check">
                        <input type="checkbox" checked={a.attended} onChange={() => void toggleAttended(a)} /> Đã đào tạo
                      </label>
                      <button className="button tertiary small" onClick={() => void removeAttendee(a)}>
                        Xóa
                      </button>
                    </>
                  ) : (
                    <span className={`status-badge ${a.attended ? "success" : "warning"}`}>{a.attended ? "Đã đào tạo" : "Chưa đào tạo"}</span>
                  )}
                </div>
              ))}
              {!rosterAttendees.length ? <div className="empty-state compact">Chưa có nhân sự nào trong danh sách.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>, document.body,
  ) : null;

  return (
    <div className="pt-overview">
      {rosterModal}
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Khai báo quy trình mới cần đào tạo</h2>
              <p>Mỗi quy trình/biểu mẫu mới ban hành là 1 dòng theo dõi đào tạo.</p>
            </div>
          </div>
          <div className="pt-form">
            <input className="input" placeholder="Tên quy trình..." value={procedureName} onChange={(e) => setProcedureName(e.target.value)} />
            <div className="pt-form-row">
              <input className="input" placeholder="Mã số (tùy chọn)" value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} />
              <input className="input" placeholder="Đơn vị soạn thảo (tùy chọn)" value={draftingUnit} onChange={(e) => setDraftingUnit(e.target.value)} />
              <input className="input" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            <button className="button primary" disabled={busy || !procedureName.trim()} onClick={() => void submit()}>
              Khai báo
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Danh sách quy trình</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã số</th>
                <th>Tên quy trình</th>
                <th>Đơn vị soạn thảo</th>
                <th>Hiệu lực</th>
                <th>Người đào tạo</th>
                <th>Đào tạo lần 1</th>
                <th>Trạng thái</th>
                <th>Đào tạo lần 2</th>
                <th>Phản hồi QLCL</th>
                <th>Ghi chú</th>
                <th>Tỷ lệ hoàn thành</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {trainings.map((t) => {
                const editing = editingId === t.id;
                return (
                  <tr key={t.id}>
                    <td>{t.procedure_code || "—"}</td>
                    <td>{t.procedure_name}</td>
                    <td>{t.drafting_unit || "—"}</td>
                    <td>{formatDate(t.effective_date)}</td>
                    <td>
                      {editing ? (
                        <input
                          className="input"
                          placeholder="Người đào tạo..."
                          value={String(editDraft.trainer ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, trainer: e.target.value }))}
                        />
                      ) : (
                        t.trainer || "—"
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <div className="pt-session-edit">
                          <input
                            className="input"
                            placeholder="Thời gian..."
                            value={String(editDraft.session_1_time ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_1_time: e.target.value }))}
                          />
                          <input
                            className="input"
                            placeholder="Địa điểm..."
                            value={String(editDraft.session_1_location ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_1_location: e.target.value }))}
                          />
                          <input
                            className="input"
                            placeholder="Cách thức..."
                            value={String(editDraft.session_1_method ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_1_method: e.target.value }))}
                          />
                        </div>
                      ) : (
                        <small>
                          {t.session_1_time || "—"} · {t.session_1_location || "—"} · {t.session_1_method || "—"}
                        </small>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select className="input" value={String(editDraft.status ?? t.status)} onChange={(e) => setEditDraft((v) => ({ ...v, status: e.target.value as any }))}>
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`status-badge ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <div className="pt-session-edit">
                          <input
                            className="input"
                            placeholder="Thời gian..."
                            value={String(editDraft.session_2_time ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_2_time: e.target.value }))}
                          />
                          <input
                            className="input"
                            placeholder="Địa điểm..."
                            value={String(editDraft.session_2_location ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_2_location: e.target.value }))}
                          />
                          <input
                            className="input"
                            placeholder="Cách thức..."
                            value={String(editDraft.session_2_method ?? "")}
                            onChange={(e) => setEditDraft((v) => ({ ...v, session_2_method: e.target.value }))}
                          />
                        </div>
                      ) : (
                        <small>
                          {t.session_2_time || "—"} · {t.session_2_location || "—"} · {t.session_2_method || "—"}
                        </small>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="input"
                          placeholder="Phản hồi QLCL..."
                          value={String(editDraft.feedback_qlcl ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, feedback_qlcl: e.target.value }))}
                        />
                      ) : (
                        t.feedback_qlcl || "—"
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="input"
                          placeholder="Ghi chú..."
                          value={String(editDraft.notes ?? "")}
                          onChange={(e) => setEditDraft((v) => ({ ...v, notes: e.target.value }))}
                        />
                      ) : (
                        t.notes || "—"
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        <span>
                          {t.attendee_attended}/{t.attendee_total} ({t.attendee_total ? Math.round((t.attendee_attended / t.attendee_total) * 100) : 0}%)
                        </span>
                        <button className="button tertiary small" onClick={() => openRoster(t)}>
                          Quản lý nhân sự
                        </button>
                      </div>
                    </td>
                    {canManage ? (
                      <td>
                        {editing ? (
                          <div className="pt-edit-actions">
                            <button className="button primary small" onClick={() => void saveEdit(t)}>
                              Lưu
                            </button>
                            <button className="button tertiary small" onClick={() => setEditingId(null)}>
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button className="button secondary small" onClick={() => startEdit(t)}>
                            Cập nhật
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!trainings.length ? (
                <tr>
                  <td colSpan={canManage ? 12 : 11} className="empty-state compact">
                    Chưa có quy trình nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .pt-overview {
          display: grid;
          gap: 16px;
        }
        .pt-form {
          display: grid;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .pt-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        .pt-session-edit {
          display: grid;
          gap: 4px;
          min-width: 180px;
        }
        .pt-edit-actions {
          display: flex;
          gap: 6px;
        }
        @media (max-width: 900px) {
          .pt-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
