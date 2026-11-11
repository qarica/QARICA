"use client";

import { useMemo, useState } from "react";
import { TQM_CHART_CSS, TqmHorizontalBars } from "@/components/tqm-charts";

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
  test_score_max: number | null;
};
type Round = { id: string; round_label: string; round_date: string | null; score_max: number | null; sort_order: number };
type Attendee = { id: string; employee_name: string; employee_code: string | null; department: string | null; job_title: string | null; attended: boolean; attended_at: string | null; notes: string | null };
type ResultRow = { id: string; attendee_id: string; round_id: string; score: number | null };
type ResponseRow = { result_id: string; question_no: number; answer_text: string | null; is_correct: boolean | null };
type QuestionRow = { question_no: number; correct_answer: string };

type ImportActionPreview =
  | {
      type: "insert";
      key: string;
      employeeName: string;
      employeeCode: string | null;
      dept: string | null;
      title: string | null;
      results: { roundLabel: string; score: number | null; conflict: boolean; responses: { questionNo: number; answerText: string; isCorrect: boolean }[] | null }[];
      included: boolean;
    }
  | {
      type: "update";
      key: string;
      attendeeId: string;
      employeeName: string;
      results: { roundLabel: string; score: number | null; conflict: boolean; responses: { questionNo: number; answerText: string; isCorrect: boolean }[] | null }[];
      included: boolean;
    };

const STATUS_LABEL: Record<string, string> = {
  TRAINED: "Đã đào tạo",
  PLANNED: "Chưa đào tạo — đã có kế hoạch",
  NOT_PLANNED: "Chưa đào tạo — chưa có kế hoạch",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function ProcedureTrainingDetailClient({
  training: initialTraining,
  rounds: initialRounds,
  attendees: initialAttendees,
  results: initialResults,
  responses: initialResponses,
  questions: initialQuestions,
  canManage,
}: {
  training: Training;
  rounds: Round[];
  attendees: Attendee[];
  results: ResultRow[];
  responses: ResponseRow[];
  questions: QuestionRow[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"info" | "roster" | "analysis" | "questions" | "import">("roster");
  const [training, setTraining] = useState(initialTraining);
  const [rounds, setRounds] = useState(initialRounds);
  const [attendees, setAttendees] = useState(initialAttendees);
  const [results, setResults] = useState(initialResults);
  const [responses, setResponses] = useState(initialResponses);
  const [questions, setQuestions] = useState(initialQuestions);
  const [error, setError] = useState("");

  const roundById = useMemo(() => new Map(rounds.map((r) => [r.id, r])), [rounds]);
  const resultsByAttendee = useMemo(() => {
    const map = new Map<string, ResultRow[]>();
    for (const r of results) map.set(r.attendee_id, [...(map.get(r.attendee_id) || []), r]);
    return map;
  }, [results]);
  const responsesByResult = useMemo(() => {
    const map = new Map<string, ResponseRow[]>();
    for (const r of responses) map.set(r.result_id, [...(map.get(r.result_id) || []), r]);
    return map;
  }, [responses]);

  return (
    <div className="ptd-page">
      {error ? <div className="alert error">{error}</div> : null}
      <div className="ptd-tabs" role="group" aria-label="Chi tiết đợt đào tạo">
        {(
          [
            ["info", "Thông tin đào tạo"],
            ["roster", "Nhân sự & điểm"],
            ["analysis", "Phân tích"],
            ["questions", "Câu hỏi & đáp án"],
            ["import", "Nhập dữ liệu"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "info" ? (
        <InfoTab training={training} setTraining={setTraining} canManage={canManage} setError={setError} />
      ) : null}
      {tab === "roster" ? (
        <RosterTab
          trainingId={training.id}
          rounds={rounds}
          setRounds={setRounds}
          attendees={attendees}
          setAttendees={setAttendees}
          setResults={setResults}
          resultsByAttendee={resultsByAttendee}
          responsesByResult={responsesByResult}
          roundById={roundById}
          canManage={canManage}
          setError={setError}
        />
      ) : null}
      {tab === "analysis" ? <AnalysisTab rounds={rounds} attendees={attendees} results={results} responses={responses} questions={questions} /> : null}
      {tab === "questions" ? <QuestionsTab trainingId={training.id} questions={questions} setQuestions={setQuestions} canManage={canManage} setError={setError} /> : null}
      {tab === "import" ? (
        <ImportTab
          trainingId={training.id}
          rounds={rounds}
          setRounds={setRounds}
          setAttendees={setAttendees}
          setResults={setResults}
          setResponses={setResponses}
          hasAnswerKey={questions.length > 0}
          setError={setError}
        />
      ) : null}

      <style jsx>{`
        .ptd-page {
          display: grid;
          gap: 16px;
        }
        .ptd-tabs {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .ptd-tabs button {
          border: 1px solid var(--line);
          border-radius: 999px;
          background: #fff;
          padding: 9px 13px;
          white-space: nowrap;
          color: var(--muted);
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }
        .ptd-tabs button.active {
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Thông tin đào tạo — form thường, không sửa-tại-chỗ trong bảng (báo cáo
// thực tế: "giao diện xấu và ko đẹp, cứng đờ ko kéo được").
// ---------------------------------------------------------------------------
function InfoTab({ training, setTraining, canManage, setError }: { training: Training; setTraining: (t: Training) => void; canManage: boolean; setError: (e: string) => void }) {
  const [draft, setDraft] = useState({
    trainer: training.trainer || "",
    session_1_time: training.session_1_time || "",
    session_1_location: training.session_1_location || "",
    session_1_method: training.session_1_method || "",
    status: training.status,
    session_2_time: training.session_2_time || "",
    session_2_location: training.session_2_location || "",
    session_2_method: training.session_2_method || "",
    feedback_qlcl: training.feedback_qlcl || "",
    notes: training.notes || "",
    test_score_max: training.test_score_max != null ? String(training.test_score_max) : "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${training.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, test_score_max: draft.test_score_max.trim() === "" ? null : Number(draft.test_score_max) }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setTraining({ ...training, ...body.training });
    setSaved(true);
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Thông tin đào tạo</h2>
      </div>
      <div className="form-stack" style={{ padding: "0 19px 19px" }}>
        <div className="form-grid two">
          <label>
            <span>Trạng thái</span>
            <select className="input" disabled={!canManage} value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value as Training["status"] }))}>
              {Object.entries(STATUS_LABEL).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Người đào tạo</span>
            <input className="input" disabled={!canManage} value={draft.trainer} onChange={(e) => setDraft((v) => ({ ...v, trainer: e.target.value }))} />
          </label>
          <label>
            <span>Thang điểm bài test mặc định (Pre/Post)</span>
            <input className="input" type="number" min={1} disabled={!canManage} placeholder="VD: 17" value={draft.test_score_max} onChange={(e) => setDraft((v) => ({ ...v, test_score_max: e.target.value }))} />
          </label>
        </div>
        <fieldset>
          <legend>Đào tạo lần 1</legend>
          <div className="form-grid two">
            <label>
              <span>Thời gian</span>
              <input className="input" disabled={!canManage} value={draft.session_1_time} onChange={(e) => setDraft((v) => ({ ...v, session_1_time: e.target.value }))} />
            </label>
            <label>
              <span>Địa điểm</span>
              <input className="input" disabled={!canManage} value={draft.session_1_location} onChange={(e) => setDraft((v) => ({ ...v, session_1_location: e.target.value }))} />
            </label>
            <label className="span-2">
              <span>Cách thức</span>
              <input className="input" disabled={!canManage} value={draft.session_1_method} onChange={(e) => setDraft((v) => ({ ...v, session_1_method: e.target.value }))} />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Đào tạo lần 2 (nếu cần đào tạo lại)</legend>
          <div className="form-grid two">
            <label>
              <span>Thời gian</span>
              <input className="input" disabled={!canManage} value={draft.session_2_time} onChange={(e) => setDraft((v) => ({ ...v, session_2_time: e.target.value }))} />
            </label>
            <label>
              <span>Địa điểm</span>
              <input className="input" disabled={!canManage} value={draft.session_2_location} onChange={(e) => setDraft((v) => ({ ...v, session_2_location: e.target.value }))} />
            </label>
            <label className="span-2">
              <span>Cách thức</span>
              <input className="input" disabled={!canManage} value={draft.session_2_method} onChange={(e) => setDraft((v) => ({ ...v, session_2_method: e.target.value }))} />
            </label>
          </div>
        </fieldset>
        <label>
          <span>Phản hồi QLCL</span>
          <textarea className="input" rows={3} disabled={!canManage} value={draft.feedback_qlcl} onChange={(e) => setDraft((v) => ({ ...v, feedback_qlcl: e.target.value }))} />
        </label>
        <label>
          <span>Ghi chú</span>
          <textarea className="input" rows={3} disabled={!canManage} value={draft.notes} onChange={(e) => setDraft((v) => ({ ...v, notes: e.target.value }))} />
        </label>
        {canManage ? (
          <div className="pt-edit-actions">
            <button className="button primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Đang lưu..." : "Lưu thông tin"}
            </button>
            {saved ? <span className="muted">Đã lưu.</span> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Nhân sự & điểm — quản lý đợt kiểm tra (round), nhân sự, điểm theo
// từng đợt, và tra cứu đúng/sai từng câu cho 1 người.
// ---------------------------------------------------------------------------
function RosterTab({
  trainingId,
  rounds,
  setRounds,
  attendees,
  setAttendees,
  setResults,
  resultsByAttendee,
  responsesByResult,
  roundById,
  canManage,
  setError,
}: {
  trainingId: string;
  rounds: Round[];
  setRounds: (fn: Round[] | ((v: Round[]) => Round[])) => void;
  attendees: Attendee[];
  setAttendees: (fn: Attendee[] | ((v: Attendee[]) => Attendee[])) => void;
  setResults: (fn: ResultRow[] | ((v: ResultRow[]) => ResultRow[])) => void;
  resultsByAttendee: Map<string, ResultRow[]>;
  responsesByResult: Map<string, ResponseRow[]>;
  roundById: Map<string, Round>;
  canManage: boolean;
  setError: (e: string) => void;
}) {
  const [newRoundLabel, setNewRoundLabel] = useState("");
  const [newRoundDate, setNewRoundDate] = useState("");
  const [roundBusy, setRoundBusy] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeCode, setNewEmployeeCode] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [scoreEdit, setScoreEdit] = useState<{ attendeeId: string; roundId: string; value: string } | null>(null);
  const [detailAttendeeId, setDetailAttendeeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function addRound() {
    if (!newRoundLabel.trim()) return;
    setRoundBusy(true);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round_label: newRoundLabel.trim(), round_date: newRoundDate || null }),
    });
    const body = await res.json().catch(() => ({}));
    setRoundBusy(false);
    if (!res.ok) {
      setError(body.error || "Không tạo được đợt kiểm tra.");
      return;
    }
    setRounds((v) => [...v, body.round as Round]);
    setNewRoundLabel("");
    setNewRoundDate("");
  }

  async function removeRound(round: Round) {
    if (!window.confirm(`Xoá đợt kiểm tra "${round.round_label}"? Toàn bộ điểm của đợt này sẽ bị xoá theo, không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/rounds/${round.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được.");
      return;
    }
    setRounds((v) => v.filter((r) => r.id !== round.id));
    setResults((v) => v.filter((r) => r.round_id !== round.id));
  }

  async function addAttendee() {
    if (!newEmployeeName.trim()) return;
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_name: newEmployeeName.trim(), employee_code: newEmployeeCode.trim() || null, department: newDept.trim() || null, job_title: newTitle.trim() || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không thêm được nhân sự.");
      return;
    }
    setAttendees((v) => [...v, body.attendee as Attendee]);
    setNewEmployeeName("");
    setNewEmployeeCode("");
    setNewDept("");
    setNewTitle("");
  }

  async function toggleAttended(a: Attendee) {
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/attendees/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attended: !a.attended }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không cập nhật được.");
      return;
    }
    setAttendees((v) => v.map((x) => (x.id === a.id ? { ...x, ...body.attendee } : x)));
  }

  async function removeAttendee(a: Attendee) {
    if (!window.confirm(`Xoá "${a.employee_name}" khỏi danh sách? Không thể hoàn tác.`)) return;
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/attendees/${a.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không xoá được.");
      return;
    }
    setAttendees((v) => v.filter((x) => x.id !== a.id));
  }

  function startScoreEdit(attendeeId: string, roundId: string, current: number | null) {
    setScoreEdit({ attendeeId, roundId, value: current != null ? String(current) : "" });
  }

  async function saveScoreEdit() {
    if (!scoreEdit) return;
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/attendees/${scoreEdit.attendeeId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round_id: scoreEdit.roundId, score: scoreEdit.value.trim() === "" ? null : Number(scoreEdit.value) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không lưu được điểm.");
      return;
    }
    setResults((v) => {
      const without = v.filter((r) => !(r.attendee_id === scoreEdit.attendeeId && r.round_id === scoreEdit.roundId));
      return [...without, { id: body.result.id, attendee_id: scoreEdit.attendeeId, round_id: scoreEdit.roundId, score: body.result.score }];
    });
    setScoreEdit(null);
  }

  const filteredAttendees = attendees.filter(
    (a) => !query.trim() || [a.employee_name, a.employee_code, a.department, a.job_title].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"))),
  );
  const detailAttendee = attendees.find((a) => a.id === detailAttendeeId) || null;

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Đợt kiểm tra (Pre-test, Post-test, định kỳ...)</h2>
            <p>1 đợt đào tạo có thể có nhiều đợt kiểm tra — không giới hạn Pre/Post.</p>
          </div>
        </div>
        <div className="ptd-round-chips" style={{ padding: "0 19px 19px" }}>
          {rounds.map((r) => (
            <span className="chip ptd-round-chip" key={r.id}>
              {r.round_label}
              {r.round_date ? ` · ${formatDate(r.round_date)}` : ""}
              {canManage ? (
                <button type="button" aria-label={`Xoá đợt ${r.round_label}`} onClick={() => void removeRound(r)}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!rounds.length ? <span className="muted">Chưa có đợt kiểm tra nào.</span> : null}
        </div>
        {canManage ? (
          <div className="ptd-round-add" style={{ padding: "0 19px 19px" }}>
            <input className="input" placeholder="Tên đợt kiểm tra (VD: Pre-test, Post-test, Định kỳ T3/2027)..." value={newRoundLabel} onChange={(e) => setNewRoundLabel(e.target.value)} />
            <input className="input" type="date" value={newRoundDate} onChange={(e) => setNewRoundDate(e.target.value)} />
            <button className="button primary small" disabled={!newRoundLabel.trim() || roundBusy} onClick={() => void addRound()}>
              + Thêm đợt
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Nhân sự & điểm</h2>
        </div>
        <div style={{ padding: "0 19px 12px" }}>
          <input className="input" placeholder="Tìm tên, mã NV, đơn vị, chức danh..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canManage ? (
          <div className="ptd-attendee-add" style={{ padding: "0 19px 19px" }}>
            <input className="input" placeholder="Tên nhân viên..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
            <input className="input" placeholder="Mã NV (tùy chọn)" value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} />
            <input className="input" placeholder="Đơn vị (tùy chọn)" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
            <input className="input" placeholder="Chức danh (tùy chọn)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button className="button primary small" disabled={!newEmployeeName.trim()} onClick={() => void addAttendee()}>
              + Thêm
            </button>
          </div>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Đơn vị</th>
                <th>Chức danh</th>
                <th>Đã đào tạo</th>
                {rounds.map((r) => (
                  <th key={r.id}>{r.round_label}</th>
                ))}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendees.map((a) => {
                const myResults = resultsByAttendee.get(a.id) || [];
                return (
                  <tr key={a.id}>
                    <td data-label="Họ tên">
                      {a.employee_name}
                      {a.employee_code ? ` (${a.employee_code})` : ""}
                    </td>
                    <td data-label="Đơn vị">{a.department || "—"}</td>
                    <td data-label="Chức danh">{a.job_title || "—"}</td>
                    <td data-label="Đã đào tạo">
                      {canManage ? (
                        <label className="inline-check">
                          <input type="checkbox" checked={a.attended} onChange={() => void toggleAttended(a)} />
                        </label>
                      ) : (
                        <span className={`status-badge ${a.attended ? "success" : "warning"}`}>{a.attended ? "Có" : "Không"}</span>
                      )}
                    </td>
                    {rounds.map((r) => {
                      const result = myResults.find((res) => res.round_id === r.id);
                      const editing = scoreEdit?.attendeeId === a.id && scoreEdit.roundId === r.id;
                      return (
                        <td key={r.id} data-label={r.round_label}>
                          {editing ? (
                            <div className="ptd-score-edit">
                              <input className="input" type="number" autoFocus value={scoreEdit.value} onChange={(e) => setScoreEdit((v) => (v ? { ...v, value: e.target.value } : v))} />
                              <button className="button primary small" onClick={() => void saveScoreEdit()}>
                                Lưu
                              </button>
                              <button className="button tertiary small" onClick={() => setScoreEdit(null)}>
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="button tertiary small" disabled={!canManage} onClick={() => startScoreEdit(a.id, r.id, result?.score ?? null)}>
                              {result?.score != null ? `${result.score}${r.score_max ? `/${r.score_max}` : ""}` : "—"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td data-label="Thao tác">
                      <div className="pt-edit-actions">
                        <button className="button secondary small" onClick={() => setDetailAttendeeId(a.id)}>
                          Xem chi tiết
                        </button>
                        {canManage ? (
                          <button className="button tertiary small" onClick={() => void removeAttendee(a)}>
                            Xóa
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredAttendees.length ? (
                <tr>
                  <td colSpan={5 + rounds.length} className="empty-state compact">
                    Chưa có nhân sự nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {detailAttendee ? (
        <AttendeeDetailPanel attendee={detailAttendee} results={resultsByAttendee.get(detailAttendee.id) || []} responsesByResult={responsesByResult} roundById={roundById} onClose={() => setDetailAttendeeId(null)} />
      ) : null}

      <style jsx>{`
        .ptd-round-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ptd-round-chip button {
          border: 0;
          background: transparent;
          color: inherit;
          margin-left: 6px;
          cursor: pointer;
          font-weight: 800;
        }
        .ptd-round-add {
          display: grid;
          grid-template-columns: 2fr 1fr auto;
          gap: 8px;
        }
        .ptd-round-add > * {
          min-width: 0;
        }
        .ptd-attendee-add {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr auto;
          gap: 8px;
        }
        .ptd-attendee-add > * {
          min-width: 0;
        }
        .ptd-score-edit {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .ptd-score-edit input {
          width: 64px;
        }
        @media (max-width: 900px) {
          .ptd-round-add,
          .ptd-attendee-add {
            grid-template-columns: 1fr 1fr;
          }
        }
        /* Báo cáo thực tế: "giao diện xấu, cứng đờ ko kéo được" — bảng nhân
           sự có thể có nhiều cột đợt kiểm tra tùy ý (không giới hạn 2), càng
           dễ tràn ngang trên điện thoại. Chuyển mỗi hàng thành 1 thẻ (card),
           mỗi ô thành 1 dòng "nhãn: giá trị" — đúng quy ước mobile-responsive
           đã dùng cho bảng công văn đến/hành nghề (xem final-visual-lock.css
           .incoming-doc-overview, .physician-license-overview) — thay vì chỉ
           cuộn ngang (dễ bị tưởng là "kẹt cứng" trên màn hình nhỏ). */
        @media (max-width: 760px) {
          .table-wrap {
            overflow: visible !important;
          }
          .table-wrap table {
            display: block !important;
            min-width:0 !important;
            width: 100% !important;
          }
          .table-wrap thead {
            display: none !important;
          }
          .table-wrap tbody {
            display: grid !important;
            gap: 12px;
          }
          .table-wrap tbody tr {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0;
            padding: 12px;
            border: 1px solid #dce5ee;
            border-radius: 14px;
            background: #fff;
            box-shadow: 0 3px 12px #10233a0a;
          }
          .table-wrap tbody td {
            display: grid !important;
            grid-template-columns: 95px minmax(0, 1fr);
            gap: 9px;
            align-items: start;
            min-width:0 !important;
            width: 100% !important;
            padding: 9px 0 !important;
            border: 0 !important;
            border-bottom: 1px solid #edf1f5 !important;
            overflow-wrap: anywhere;
            white-space: normal !important;
          }
          .table-wrap tbody td:last-child {
            border-bottom: 0 !important;
          }
          .table-wrap tbody td[data-label]::before {
            content: attr(data-label);
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
          }
          .table-wrap tbody td[data-label="Họ tên"] {
            font-weight: 700;
            color: #12324d;
          }
          .table-wrap tbody td[data-label="Thao tác"] {
            display: flex !important;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
          }
          .table-wrap tbody td[data-label="Thao tác"]::before {
            flex: 0 0 100%;
          }
          .table-wrap tbody td.empty-state {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel chi tiết 1 người: điểm theo từng đợt + đúng/sai từng câu (báo cáo
// thực tế: "Muốn xem 1 người thì làm sao tra cứu bao nhiêu điểm, sai câu
// nào đúng câu nào").
// ---------------------------------------------------------------------------
function AttendeeDetailPanel({
  attendee,
  results,
  responsesByResult,
  roundById,
  onClose,
}: {
  attendee: Attendee;
  results: ResultRow[];
  responsesByResult: Map<string, ResponseRow[]>;
  roundById: Map<string, Round>;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>Chi tiết: {attendee.employee_name}</h2>
            <p>
              {attendee.department || "—"} · {attendee.job_title || "—"}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: "grid", gap: 14 }}>
        {results.length ? (
          results
            .map((r) => ({ r, round: roundById.get(r.round_id) }))
            .filter((x) => x.round)
            .map(({ r, round }) => {
              const qResponses = (responsesByResult.get(r.id) || []).slice().sort((a, b) => a.question_no - b.question_no);
              return (
                <div key={r.id} className="ptd-detail-round">
                  <div className="ptd-detail-round-head">
                    <strong>{round!.round_label}</strong>
                    <span className="status-badge info">
                      {r.score != null ? `${r.score}${round!.score_max ? `/${round!.score_max}` : ""}` : "Chưa có điểm"}
                    </span>
                  </div>
                  {qResponses.length ? (
                    <ul className="ptd-response-list">
                      {qResponses.map((resp) => (
                        <li key={resp.question_no} className={resp.is_correct ? "is-correct" : "is-wrong"}>
                          <span>Câu {resp.question_no}:</span> <span>{resp.answer_text || "—"}</span>
                          <span className={`status-badge ${resp.is_correct ? "success" : "danger"}`}>{resp.is_correct ? "Đúng" : "Sai"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted tiny">Không có chi tiết từng câu cho đợt này (nhập thủ công, hoặc nhập từ file đã chấm sẵn — chỉ có điểm tổng).</p>
                  )}
                </div>
              );
            })
        ) : (
          <p className="empty-state compact">Chưa có kết quả kiểm tra nào.</p>
        )}
        </div>
      </div>
      <style jsx>{`
        .ptd-detail-round {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 12px;
        }
        .ptd-detail-round-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .ptd-response-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 6px;
        }
        .ptd-response-list li {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 8px;
          background: #f8fafb;
        }
        .ptd-response-list li.is-wrong {
          background: var(--danger-soft, #fee2e2);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Phân tích — điểm theo đợt, theo đơn vị/chức danh, độ khó từng câu
// (báo cáo thực tế: "chưa có phân tích kết quả theo đối tượng, trước sau").
// ---------------------------------------------------------------------------
function AnalysisTab({ rounds, attendees, results, responses, questions }: { rounds: Round[]; attendees: Attendee[]; results: ResultRow[]; responses: ResponseRow[]; questions: QuestionRow[] }) {
  const attendeeById = useMemo(() => new Map(attendees.map((a) => [a.id, a])), [attendees]);

  const byRound = rounds.map((r) => {
    const scores = results.filter((res) => res.round_id === r.id && res.score != null).map((res) => res.score as number);
    return { round: r, count: scores.length, average: avg(scores) };
  });

  function groupBy(getKey: (a: Attendee) => string | null) {
    const groups = new Map<string, { attendeeId: string; roundId: string; score: number }[]>();
    for (const res of results) {
      if (res.score == null) continue;
      const a = attendeeById.get(res.attendee_id);
      if (!a) continue;
      const key = getKey(a) || "Chưa phân loại";
      groups.set(key, [...(groups.get(key) || []), { attendeeId: res.attendee_id, roundId: res.round_id, score: res.score }]);
    }
    return Array.from(groups.entries())
      .map(([key, rows]) => ({ key, count: rows.length, average: avg(rows.map((r) => r.score)) }))
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  }
  const byDept = groupBy((a) => a.department);
  const byTitle = groupBy((a) => a.job_title);

  const sortedRounds = [...rounds].sort((a, b) => a.sort_order - b.sort_order);
  const firstRound = sortedRounds[0];
  const lastRound = sortedRounds[sortedRounds.length - 1];
  const beforeAfter =
    firstRound && lastRound && firstRound.id !== lastRound.id
      ? groupByBeforeAfter(attendees, results, firstRound.id, lastRound.id)
      : null;

  const responsesByQuestion = useMemo(() => {
    const map = new Map<number, ResponseRow[]>();
    for (const r of responses) map.set(r.question_no, [...(map.get(r.question_no) || []), r]);
    return map;
  }, [responses]);
  const questionDifficulty = questions
    .map((q) => {
      const rs = responsesByQuestion.get(q.question_no) || [];
      const correctCount = rs.filter((r) => r.is_correct).length;
      return { questionNo: q.question_no, total: rs.length, correctCount, pctCorrect: rs.length ? Math.round((correctCount / rs.length) * 100) : null };
    })
    .sort((a, b) => a.questionNo - b.questionNo);

  const roundChartRows = byRound
    .filter((b) => b.average != null)
    .map((b) => ({ label: b.round.round_label, value: Math.round((b.average as number) * 100) / 100, caption: `${b.count} người có điểm`, tone: "blue" as const }));
  const deptChartRows = byDept.filter((d) => d.average != null).map((d) => ({ label: d.key, value: Math.round((d.average as number) * 100) / 100, caption: `${d.count} lượt`, tone: "brand" as const }));
  const titleChartRows = byTitle.filter((d) => d.average != null).map((d) => ({ label: d.key, value: Math.round((d.average as number) * 100) / 100, caption: `${d.count} lượt`, tone: "blue" as const }));
  const beforeAfterChartRows = (beforeAfter || [])
    .filter((r) => r.before != null && r.after != null && r.delta != null)
    .map((r) => ({
      label: r.key,
      value: Math.round(Math.abs(r.delta as number) * 100) / 100,
      caption: `${(r.before as number).toFixed(1)} → ${(r.after as number).toFixed(1)} (${(r.delta as number) >= 0 ? "+" : ""}${(r.delta as number).toFixed(1)})`,
      tone: (r.delta as number) >= 0 ? ("green" as const) : ("red" as const),
    }))
    .sort((a, b) => b.value - a.value);
  const questionChartRows = questionDifficulty
    .filter((q) => q.pctCorrect != null)
    .map((q) => ({
      label: `Câu ${q.questionNo}`,
      value: q.pctCorrect as number,
      caption: `${q.correctCount}/${q.total} đúng`,
      tone: (q.pctCorrect as number) < 60 ? ("red" as const) : (q.pctCorrect as number) < 80 ? ("amber" as const) : ("green" as const),
    }));

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <h2>Điểm trung bình theo đợt kiểm tra</h2>
        </div>
        {roundChartRows.length ? <TqmHorizontalBars rows={roundChartRows} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đợt</th>
                <th>Số người có điểm</th>
                <th>Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {byRound.map(({ round, count, average }) => (
                <tr key={round.id}>
                  <td data-label="Đợt">{round.round_label}</td>
                  <td data-label="Số người có điểm">{count}</td>
                  <td data-label="Điểm TB">{average != null ? `${average.toFixed(2)}${round.score_max ? `/${round.score_max}` : ""}` : "—"}</td>
                </tr>
              ))}
              {!byRound.length ? (
                <tr>
                  <td colSpan={3} className="empty-state compact">
                    Chưa có đợt kiểm tra nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {beforeAfter ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>So sánh trước/sau theo đơn vị</h2>
              <p>
                {firstRound!.round_label} → {lastRound!.round_label}
              </p>
            </div>
          </div>
          {beforeAfterChartRows.length ? <TqmHorizontalBars rows={beforeAfterChartRows} /> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Đơn vị</th>
                  <th>{firstRound!.round_label} (TB)</th>
                  <th>{lastRound!.round_label} (TB)</th>
                  <th>Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {beforeAfter.map((row) => (
                  <tr key={row.key}>
                    <td data-label="Đơn vị">{row.key}</td>
                    <td data-label={`${firstRound!.round_label} (TB)`}>{row.before != null ? row.before.toFixed(2) : "—"}</td>
                    <td data-label={`${lastRound!.round_label} (TB)`}>{row.after != null ? row.after.toFixed(2) : "—"}</td>
                    <td data-label="Chênh lệch" className={row.delta != null ? (row.delta >= 0 ? "text-success" : "text-danger") : ""}>{row.delta != null ? (row.delta >= 0 ? `+${row.delta.toFixed(2)}` : row.delta.toFixed(2)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <h2>Điểm trung bình theo đơn vị</h2>
        </div>
        {deptChartRows.length ? <TqmHorizontalBars rows={deptChartRows} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đơn vị</th>
                <th>Số lượt có điểm</th>
                <th>Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {byDept.map((row) => (
                <tr key={row.key}>
                  <td data-label="Đơn vị">{row.key}</td>
                  <td data-label="Số lượt có điểm">{row.count}</td>
                  <td data-label="Điểm TB">{row.average != null ? row.average.toFixed(2) : "—"}</td>
                </tr>
              ))}
              {!byDept.length ? (
                <tr>
                  <td colSpan={3} className="empty-state compact">
                    Chưa có điểm nào để phân tích.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Điểm trung bình theo chức danh</h2>
        </div>
        {titleChartRows.length ? <TqmHorizontalBars rows={titleChartRows} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chức danh</th>
                <th>Số lượt có điểm</th>
                <th>Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {byTitle.map((row) => (
                <tr key={row.key}>
                  <td data-label="Chức danh">{row.key}</td>
                  <td data-label="Số lượt có điểm">{row.count}</td>
                  <td data-label="Điểm TB">{row.average != null ? row.average.toFixed(2) : "—"}</td>
                </tr>
              ))}
              {!byTitle.length ? (
                <tr>
                  <td colSpan={3} className="empty-state compact">
                    Chưa có điểm nào để phân tích.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {questionDifficulty.length ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Độ khó từng câu (gộp mọi đợt kiểm tra)</h2>
              <p>% trả lời đúng — câu nào thấp nghĩa là nhiều người hay sai, cần nhấn mạnh lại khi đào tạo.</p>
            </div>
          </div>
          {questionChartRows.length ? <TqmHorizontalBars rows={questionChartRows} max={100} /> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Câu</th>
                  <th>Số lượt trả lời</th>
                  <th>Số lượt đúng</th>
                  <th>% đúng</th>
                </tr>
              </thead>
              <tbody>
                {questionDifficulty.map((q) => (
                  <tr key={q.questionNo}>
                    <td data-label="Câu">Câu {q.questionNo}</td>
                    <td data-label="Số lượt trả lời">{q.total}</td>
                    <td data-label="Số lượt đúng">{q.correctCount}</td>
                    <td data-label="% đúng">{q.pctCorrect != null ? `${q.pctCorrect}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <style jsx>{`
        @media (max-width: 760px) {
          .table-wrap {
            overflow: visible !important;
          }
          .table-wrap table {
            display: block !important;
            min-width:0 !important;
            width: 100% !important;
          }
          .table-wrap thead {
            display: none !important;
          }
          .table-wrap tbody {
            display: grid !important;
            gap: 12px;
          }
          .table-wrap tbody tr {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0;
            padding: 12px;
            border: 1px solid #dce5ee;
            border-radius: 14px;
            background: #fff;
            box-shadow: 0 3px 12px #10233a0a;
          }
          .table-wrap tbody td {
            display: grid !important;
            grid-template-columns: 105px minmax(0, 1fr);
            gap: 9px;
            align-items: start;
            min-width:0 !important;
            width: 100% !important;
            padding: 9px 0 !important;
            border: 0 !important;
            border-bottom: 1px solid #edf1f5 !important;
            overflow-wrap: anywhere;
            white-space: normal !important;
          }
          .table-wrap tbody td:last-child {
            border-bottom: 0 !important;
          }
          .table-wrap tbody td[data-label]::before {
            content: attr(data-label);
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
          }
          .table-wrap tbody td.empty-state {
            display: block !important;
          }
        }
      `}</style>
      <style>{TQM_CHART_CSS}</style>
    </>
  );
}

function groupByBeforeAfter(attendees: Attendee[], results: ResultRow[], beforeRoundId: string, afterRoundId: string) {
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const groups = new Map<string, { before: number[]; after: number[] }>();
  for (const res of results) {
    if (res.score == null) continue;
    if (res.round_id !== beforeRoundId && res.round_id !== afterRoundId) continue;
    const a = attendeeById.get(res.attendee_id);
    if (!a) continue;
    const key = a.department || "Chưa phân loại";
    const g = groups.get(key) || { before: [], after: [] };
    if (res.round_id === beforeRoundId) g.before.push(res.score);
    else g.after.push(res.score);
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .map(([key, g]) => {
      const before = avg(g.before);
      const after = avg(g.after);
      return { key, before, after, delta: before != null && after != null ? after - before : null };
    })
    .sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
}

// ---------------------------------------------------------------------------
// Tab: Câu hỏi & đáp án
// ---------------------------------------------------------------------------
function QuestionsTab({
  trainingId,
  questions,
  setQuestions,
  canManage,
  setError,
}: {
  trainingId: string;
  questions: QuestionRow[];
  setQuestions: (v: QuestionRow[]) => void;
  canManage: boolean;
  setError: (e: string) => void;
}) {
  const [text, setText] = useState(questions.map((q) => q.correct_answer).join("\n"));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    const answers = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch(`/api/procedure-trainings/${trainingId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được đáp án.");
      return;
    }
    setQuestions(body.questions as QuestionRow[]);
    setText((body.questions as QuestionRow[]).map((q) => q.correct_answer).join("\n"));
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Câu hỏi & đáp án</h2>
          <p>Mỗi dòng 1 câu, đúng thứ tự câu hỏi trong file khảo sát — dùng để tự chấm điểm khi nhập file câu trả lời thô.</p>
        </div>
      </div>
      <div style={{ padding: "0 19px 19px", display: "grid", gap: 10 }}>
        <textarea className="input" rows={12} disabled={!canManage} placeholder={"Câu 1: 24 giờ và 36 giờ\nCâu 2: SOAP\n..."} value={text} onChange={(e) => setText(e.target.value)} />
        {canManage ? (
          <button className="button primary" disabled={saving} onClick={() => void save()} style={{ justifySelf: "start" }}>
            {saving ? "Đang lưu..." : `Lưu đáp án (${text.split("\n").filter((s) => s.trim()).length} câu)`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Nhập dữ liệu — import file khảo sát (Google/Microsoft Form) hoặc file
// đã chấm sẵn.
// ---------------------------------------------------------------------------
function ImportTab({
  trainingId,
  rounds,
  setRounds,
  setAttendees,
  setResults,
  setResponses,
  hasAnswerKey,
  setError,
}: {
  trainingId: string;
  rounds: Round[];
  setRounds: (fn: Round[] | ((v: Round[]) => Round[])) => void;
  setAttendees: (fn: Attendee[] | ((v: Attendee[]) => Attendee[])) => void;
  setResults: (fn: ResultRow[] | ((v: ResultRow[]) => ResultRow[])) => void;
  setResponses: (fn: ResponseRow[] | ((v: ResponseRow[]) => ResponseRow[])) => void;
  hasAnswerKey: boolean;
  setError: (e: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [defaultRoundLabel, setDefaultRoundLabel] = useState(rounds[0]?.round_label || "Pre-test");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportActionPreview[] | null>(null);
  const [meta, setMeta] = useState<{ rowCount: number; questionCount: number; hasGroupColumn: boolean; scoringSkippedCount: number } | null>(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const [result, setResult] = useState("");

  async function previewImport() {
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setResult("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("default_round_label", defaultRoundLabel);
    const res = await fetch(`/api/procedure-trainings/${trainingId}/import`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Không đọc được file.");
      return;
    }
    setPreview(((body.actions || []) as Omit<ImportActionPreview, "included">[]).map((a) => ({ ...a, included: true }) as ImportActionPreview));
    setMeta({ rowCount: body.rowCount, questionCount: body.questionCount, hasGroupColumn: body.hasGroupColumn, scoringSkippedCount: body.scoringSkippedCount });
  }

  function toggleRow(key: string) {
    setPreview((v) => (v ? v.map((a) => (a.key === key ? { ...a, included: !a.included } : a)) : v));
  }

  async function commitImport() {
    if (!preview) return;
    setCommitBusy(true);
    setError("");
    const actions = preview
      .filter((a) => a.included)
      .map((a) =>
        a.type === "insert"
          ? { type: "insert", employeeName: a.employeeName, employeeCode: a.employeeCode, dept: a.dept, title: a.title, results: a.results }
          : { type: "update", attendeeId: a.attendeeId, employeeName: a.employeeName, results: a.results },
      );
    const res = await fetch(`/api/procedure-trainings/${trainingId}/import/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const body = await res.json().catch(() => ({}));
    setCommitBusy(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setResult(`Đã thêm ${body.insertedCount} người mới, cập nhật ${body.updatedCount} người.${body.errors?.length ? ` (${body.errors.length} dòng bị bỏ qua, xem lại dữ liệu)` : ""}`);
    setPreview(null);
    setMeta(null);
    setFile(null);

    const [attendeesRes, roundsRes] = await Promise.all([
      fetch(`/api/procedure-trainings/${trainingId}/attendees`).then((r) => r.json()).catch(() => null),
      fetch(`/api/procedure-trainings/${trainingId}/rounds`).then((r) => r.json()).catch(() => null),
    ]);
    if (roundsRes?.rounds) setRounds(roundsRes.rounds as Round[]);
    if (attendeesRes?.attendees) {
      const list = attendeesRes.attendees as (Attendee & { results: { id: string; round_id: string; score: number | null }[] })[];
      setAttendees(list.map((a): Attendee => ({ id: a.id, employee_name: a.employee_name, employee_code: a.employee_code, department: a.department, job_title: a.job_title, attended: a.attended, attended_at: a.attended_at, notes: a.notes })));
      setResults(list.flatMap((a) => a.results.map((r) => ({ ...r, attendee_id: a.id }))));
      // responses chi tiết chỉ cần khi mở "Xem chi tiết" — tải lại trang để đơn giản hoá thay vì gọi N query riêng.
      setResponses([]);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Nhập từ file khảo sát (Google/Microsoft Form)</h2>
          <p>Đọc file khảo sát thô (mỗi cột 1 câu hỏi) hoặc file đã chấm sẵn (có cột Điểm), tự chấm theo đáp án đã khai báo, tự ghép theo tên.</p>
        </div>
      </div>
      <div style={{ padding: "0 19px 19px", display: "grid", gap: 12 }}>
        {!hasAnswerKey ? <div className="alert error">Chưa khai báo đáp án ở tab &quot;Câu hỏi &amp; đáp án&quot; — nếu file là câu trả lời thô (chưa có điểm sẵn), cần khai báo đáp án trước mới chấm được điểm.</div> : null}
        <div className="ptd-import-upload">
          <input className="input" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <label className="ptd-import-default-round">
            <span>Nếu file không có cột Nhóm, coi là đợt:</span>
            <input className="input" list="ptd-round-options" value={defaultRoundLabel} onChange={(e) => setDefaultRoundLabel(e.target.value)} placeholder="Pre-test" />
            <datalist id="ptd-round-options">
              {rounds.map((r) => (
                <option key={r.id} value={r.round_label} />
              ))}
            </datalist>
          </label>
          <button className="button primary small" disabled={!file || busy} onClick={() => void previewImport()}>
            {busy ? "Đang đọc..." : "Xem trước"}
          </button>
        </div>

        {result ? <div className="alert success">{result}</div> : null}

        {meta ? (
          <div className="muted tiny">
            Đọc được {meta.rowCount} dòng, {meta.questionCount || "—"} câu hỏi.
            {!meta.hasGroupColumn ? ` File không có cột Nhóm — đã coi toàn bộ là đợt "${defaultRoundLabel}".` : ""}
            {meta.scoringSkippedCount > 0 ? ` Chưa tính được điểm cho ${meta.scoringSkippedCount} dòng vì chưa có đáp án.` : ""}
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="ptd-import-preview">
              {preview.map((a) => (
                <label key={a.key} className={`ptd-import-row ${a.included ? "" : "is-excluded"}`}>
                  <input type="checkbox" checked={a.included} onChange={() => toggleRow(a.key)} />
                  <span className={`status-badge ${a.type === "insert" ? "info" : "warning"}`}>{a.type === "insert" ? "Mới" : "Cập nhật"}</span>
                  <span className="ptd-import-row-name">{a.employeeName}</span>
                  <small>
                    {a.results.map((r) => `${r.roundLabel}: ${r.score ?? "—"}${r.conflict ? " (ghi đè)" : ""}`).join(" · ")}
                  </small>
                </label>
              ))}
              {!preview.length ? <div className="empty-state compact">Không có dòng nào đọc được từ file.</div> : null}
            </div>
            <button className="button primary small" disabled={commitBusy || !preview.some((a) => a.included)} onClick={() => void commitImport()} style={{ justifySelf: "start" }}>
              {commitBusy ? "Đang lưu..." : `Xác nhận nhập (${preview.filter((a) => a.included).length} dòng)`}
            </button>
          </>
        ) : null}
      </div>
      <style jsx>{`
        .ptd-import-upload {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .ptd-import-upload > * {
          min-width: 0;
        }
        .ptd-import-default-round {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #46545a;
          white-space: nowrap;
        }
        .ptd-import-default-round input {
          width: 160px;
        }
        .ptd-import-preview {
          display: grid;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
        }
        .ptd-import-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 7px 9px;
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 12px;
        }
        .ptd-import-row.is-excluded {
          opacity: 0.5;
        }
        .ptd-import-row-name {
          font-weight: 700;
          flex: 1 1 auto;
        }
      `}</style>
    </section>
  );
}
