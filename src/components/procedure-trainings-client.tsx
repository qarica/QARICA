"use client";

import { useState } from "react";

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

  return (
    <div className="pt-overview">
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
                <th>Đào tạo lần 1</th>
                <th>Trạng thái</th>
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
                  <td colSpan={canManage ? 7 : 6} className="empty-state compact">
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
