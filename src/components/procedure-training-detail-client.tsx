"use client";

/* eslint-disable @next/next/no-img-element -- Mã QR là data URL tạo client-side (qrcode), không phải ảnh tĩnh/remote để Next tối ưu (theo đúng quy ước đã dùng ở medical-equipment-detail-client.tsx). */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Icon } from "@/components/icon";
import { KpiCard } from "@/components/kpi-card";
import { TQM_CHART_CSS, TqmColumnBars, TqmGroupedBars } from "@/components/tqm-charts";
import { computePassStatus } from "@/lib/procedure-training-pass-status";
import { normalizeEmployeeCode } from "@/lib/training-self-test";

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
  pass_threshold: number | null;
  is_open_for_registration: boolean;
};
type Round = { id: string; round_label: string; round_date: string | null; score_max: number | null; sort_order: number; is_open_for_submission: boolean };
type Attendee = { id: string; employee_name: string; employee_code: string | null; department: string | null; job_title: string | null; attended: boolean; attended_at: string | null; notes: string | null };
type ResultRow = { id: string; attendee_id: string; round_id: string; score: number | null };
type ResponseRow = { result_id: string; question_no: number; answer_text: string | null; is_correct: boolean | null };
type QuestionRow = { question_no: number; correct_answer: string; question_text: string | null; choices: string[] | null };
type Department = { id: string; name: string; staff_count?: number | null };
type Registration = { id: string; employee_name: string; employee_code: string | null; department: string | null; job_title: string | null; registered_at: string; round_id: string | null };

// "Các danh sách dài thì thu gọn mặc định, cần thì bấm nút mở rộng" — ngưỡng
// chung cho mọi danh sách dài trong trang chi tiết đào tạo (nhân sự & điểm,
// bảng xếp hạng, tuyên dương).
const LIST_COLLAPSE_LIMIT = 8;

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
  departments,
  registrations: initialRegistrations,
  canManage,
}: {
  training: Training;
  rounds: Round[];
  attendees: Attendee[];
  results: ResultRow[];
  responses: ResponseRow[];
  questions: QuestionRow[];
  departments: Department[];
  registrations: Registration[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"info" | "roster" | "registration" | "analysis" | "questions" | "import">("roster");
  const [training, setTraining] = useState(initialTraining);
  const [rounds, setRounds] = useState(initialRounds);
  const [attendees, setAttendees] = useState(initialAttendees);
  const [results, setResults] = useState(initialResults);
  const [responses, setResponses] = useState(initialResponses);
  const [questions, setQuestions] = useState(initialQuestions);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [error, setError] = useState("");

  // "+ Thêm đợt" không có ô nhập thang điểm riêng cho từng đợt — round.score_max
  // gần như luôn null trên dữ liệu thật, chỉ training.test_score_max (tab
  // Thông tin đào tạo) mới thật sự được admin điền. Dùng round.score_max làm
  // thang điểm nếu có (vd nhập từ file import), nếu không thì lấy mặc định
  // từ training — tính 1 lần ở đây, truyền xuống mọi nơi hiển thị/so điểm,
  // tránh mỗi chỗ đọc thẳng round.score_max rồi âm thầm ra "—"/không vẽ được
  // biểu đồ % (báo cáo thực tế: "% thang điểm" trống, chưa vẽ được cột).
  const effectiveRounds = useMemo(() => rounds.map((r) => ({ ...r, score_max: r.score_max ?? training.test_score_max })), [rounds, training.test_score_max]);
  const roundById = useMemo(() => new Map(effectiveRounds.map((r) => [r.id, r])), [effectiveRounds]);
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
            ["questions", "Câu hỏi & đáp án"],
            ["registration", "Đăng ký"],
            ["roster", "Nhân sự & điểm"],
            ["import", "Nhập dữ liệu"],
            ["analysis", "Phân tích"],
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
          rounds={effectiveRounds}
          setRounds={setRounds}
          attendees={attendees}
          setAttendees={setAttendees}
          setResults={setResults}
          resultsByAttendee={resultsByAttendee}
          responsesByResult={responsesByResult}
          roundById={roundById}
          hasQuestions={questions.length > 0}
          questions={questions}
          departments={departments}
          passThreshold={training.pass_threshold}
          canManage={canManage}
          setError={setError}
        />
      ) : null}
      {tab === "registration" ? (
        <RegistrationTab
          trainingId={training.id}
          isOpen={training.is_open_for_registration}
          setTraining={setTraining}
          registrations={registrations}
          setRegistrations={setRegistrations}
          attendees={attendees}
          departments={departments}
          roundById={roundById}
          canManage={canManage}
          setError={setError}
        />
      ) : null}
      {tab === "analysis" ? <AnalysisTab rounds={effectiveRounds} attendees={attendees} results={results} responses={responses} questions={questions} passThreshold={training.pass_threshold} /> : null}
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
function buildInfoDraft(training: Training) {
  return {
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
    pass_threshold: training.pass_threshold != null ? String(training.pass_threshold) : "",
  };
}

function InfoTab({ training, setTraining, canManage, setError }: { training: Training; setTraining: (t: Training) => void; canManage: boolean; setError: (e: string) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => buildInfoDraft(training));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Báo cáo thực tế: "Phải có nút bấm hoàn thành lớp" — trước đây muốn đánh
  // dấu status="TRAINED" phải bấm "Sửa" mở form rồi đổi dropdown "Trạng
  // thái" rồi lưu, không rõ ràng là 1 hành động "hoàn thành lớp". Thêm nút
  // bấm 1 chạm riêng ở màn xem (không cần mở form sửa); đánh dấu xong thì
  // DELETE /api/procedure-trainings/[id] đã tự chặn xoá (status="TRAINED"
  // → 409, xem route.ts) nên không cần thêm gì ở đây để "không cho xoá".
  async function completeTraining() {
    if (!window.confirm('Đánh dấu lớp này là "Đã đào tạo"? Sau khi hoàn thành sẽ không thể xoá cả lớp (vẫn sửa lại tình trạng được nếu cần).')) return;
    setCompleting(true);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${training.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "TRAINED" }),
    });
    const body = await res.json().catch(() => ({}));
    setCompleting(false);
    if (!res.ok) {
      setError(body.error || "Không đánh dấu hoàn thành được.");
      return;
    }
    setTraining({ ...training, ...body.training });
    setDraft((v) => ({ ...v, status: "TRAINED" }));
  }

  // "1 chủ đề đào tạo có thể có nhiều lớp khác nhau, chủ động khai báo thông
  // tin lớp và kế thừa thông tin đợt cũ" — tạo 1 lớp (procedure_trainings)
  // MỚI kế thừa tên/mã quy trình/giảng viên/thang điểm, rồi chuyển sang
  // trang lớp mới để sửa lại thời gian/địa điểm cho đúng.
  async function duplicateTraining() {
    // Báo cáo thực tế: "Bấm tạo lớp mới mất hết dữ liệu cũ" — kiểm tra trực
    // tiếp trên Supabase sống xác nhận KHÔNG mất dữ liệu (lớp cũ vẫn còn
    // nguyên nhân sự/đợt kiểm tra/điểm/câu hỏi); nguyên nhân là chuyển trang
    // ngay sang 1 lớp MỚI HOÀN TOÀN TRỐNG cùng tên/mã quy trình, nhìn như lớp
    // cũ bị xoá sạch. Thêm xác nhận rõ ràng trước khi tạo để không bấm nhầm.
    if (!window.confirm('Tạo 1 LỚP MỚI riêng (trống, chưa có nhân sự/điểm) cùng chủ đề này. Lớp hiện tại KHÔNG bị ảnh hưởng, vẫn xem lại được trong danh sách "Phổ biến & đào tạo". Tiếp tục?')) return;
    setDuplicating(true);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${training.id}/duplicate`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setDuplicating(false);
    if (!res.ok) {
      setError(body.error || "Không tạo được lớp mới.");
      return;
    }
    router.push(`/procedure-trainings/${body.training.id}`);
  }
  // Mặc định KHÓA (chỉ xem) — báo cáo thực tế: "khi tạo xong thì phải lưu và
  // che lại, cần sửa thì bấm sửa để tránh bấm nhầm" (cùng quy ước với Câu
  // hỏi & đáp án). Bấm "Sửa" mới mở lại form chỉnh sửa; "Hủy" bỏ thay đổi
  // chưa lưu và khóa lại.
  const [editing, setEditing] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${training.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        test_score_max: draft.test_score_max.trim() === "" ? null : Number(draft.test_score_max),
        pass_threshold: draft.pass_threshold.trim() === "" ? null : Number(draft.pass_threshold),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được.");
      return;
    }
    setTraining({ ...training, ...body.training });
    setSaved(true);
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(buildInfoDraft(training));
    setEditing(false);
  }

  if (!editing) {
    return (
      <section className="panel">
        <div className="panel-title">
          <h2>Thông tin đào tạo</h2>
        </div>
        <div className="detail-grid">
          <div>
            <span>Trạng thái</span>
            {STATUS_LABEL[training.status] || training.status}
          </div>
          <div>
            <span>Người đào tạo</span>
            {training.trainer || "—"}
          </div>
          <div>
            <span>Thang điểm bài test mặc định (Pre/Post)</span>
            {training.test_score_max ?? "—"}
          </div>
          <div>
            <span>Điểm đạt</span>
            {training.pass_threshold ?? "—"}
          </div>
          <div>
            <span>Đào tạo lần 1 — Thời gian</span>
            {training.session_1_time || "—"}
          </div>
          <div>
            <span>Đào tạo lần 1 — Địa điểm</span>
            {training.session_1_location || "—"}
          </div>
          <div className="span-2">
            <span>Đào tạo lần 1 — Cách thức</span>
            {training.session_1_method || "—"}
          </div>
          <div>
            <span>Đào tạo lần 2 — Thời gian</span>
            {training.session_2_time || "—"}
          </div>
          <div>
            <span>Đào tạo lần 2 — Địa điểm</span>
            {training.session_2_location || "—"}
          </div>
          <div className="span-2">
            <span>Đào tạo lần 2 — Cách thức</span>
            {training.session_2_method || "—"}
          </div>
          <div className="span-2">
            <span>Phản hồi QLCL</span>
            {training.feedback_qlcl || "—"}
          </div>
          <div className="span-2">
            <span>Ghi chú</span>
            {training.notes || "—"}
          </div>
        </div>
        {canManage ? (
          <div className="pt-edit-actions" style={{ padding: "0 19px 19px" }}>
            <button type="button" className="button secondary" onClick={() => setEditing(true)}>
              Sửa
            </button>
            {training.status !== "TRAINED" ? (
              <button type="button" className="button primary" disabled={completing} onClick={() => void completeTraining()} title="Đánh dấu lớp này đã hoàn thành đào tạo — sau đó không thể xoá cả lớp">
                {completing ? "Đang lưu..." : "✓ Hoàn thành lớp"}
              </button>
            ) : null}
            <button type="button" className="button tertiary" disabled={duplicating} onClick={() => void duplicateTraining()} title="Tạo 1 lớp mới cùng chủ đề, kế thừa thông tin của lớp này — dùng khi mở thêm 1 lớp/đợt khác ngày">
              {duplicating ? "Đang tạo..." : "+ Tạo lớp mới cùng chủ đề"}
            </button>
          </div>
        ) : null}
      </section>
    );
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
          <label>
            <span>Điểm đạt (tùy chọn)</span>
            <input
              className="input"
              type="number"
              min={0}
              disabled={!canManage}
              placeholder="VD: 12 — để trống nếu không áp dụng đạt/không đạt"
              value={draft.pass_threshold}
              onChange={(e) => setDraft((v) => ({ ...v, pass_threshold: e.target.value }))}
            />
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
            <button type="button" className="button tertiary" onClick={cancelEdit}>
              Hủy
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
  hasQuestions,
  questions,
  departments,
  passThreshold,
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
  hasQuestions: boolean;
  questions: QuestionRow[];
  departments: Department[];
  passThreshold: number | null;
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
  const [deptEdit, setDeptEdit] = useState<{ attendeeId: string; value: string } | null>(null);
  const [detailAttendeeId, setDetailAttendeeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "pass" | "fail" | "none">("all");
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [qrRoundId, setQrRoundId] = useState<string | null>(null);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  // Báo cáo thực tế (khảo sát giấy cũ): "Mục đơn vị phụ trách là khoa phòng
  // nên 1 số nhân viên điền chưa đúng" — đơn vị phải chọn từ danh mục
  // khoa/phòng đã cấu hình, không tự gõ; dữ liệu cũ/nhập tay trước đó có thể
  // không khớp danh mục (sai chính tả, viết tắt, đơn vị bên ngoài...) — đánh
  // dấu "Cần xác nhận lại" để admin tự sửa, không tự động đổi dữ liệu người dùng.
  const departmentNameSet = useMemo(() => new Set(departments.map((d) => d.name.trim().toLocaleLowerCase("vi"))), [departments]);
  function isDeptMismatch(dept: string | null) {
    if (!dept || !dept.trim()) return false;
    return !departmentNameSet.has(dept.trim().toLocaleLowerCase("vi"));
  }

  function startDeptEdit(a: Attendee) {
    setDeptEdit({ attendeeId: a.id, value: a.department || "" });
  }

  async function saveDeptEdit() {
    if (!deptEdit) return;
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/attendees/${deptEdit.attendeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: deptEdit.value || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Không lưu được đơn vị.");
      return;
    }
    setAttendees((v) => v.map((x) => (x.id === deptEdit.attendeeId ? { ...x, ...body.attendee } : x)));
    setDeptEdit(null);
  }

  async function toggleRoundOpen(round: Round) {
    setError("");
    setToggleBusyId(round.id);
    const res = await fetch(`/api/procedure-trainings/${trainingId}/rounds/${round.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_open_for_submission: !round.is_open_for_submission }),
    });
    const body = await res.json().catch(() => ({}));
    setToggleBusyId(null);
    if (!res.ok) {
      setError(body.error || "Không cập nhật được trạng thái làm bài.");
      return;
    }
    setRounds((v) => v.map((r) => (r.id === round.id ? { ...r, ...body.round } : r)));
  }

  async function addRound() {
    if (!newRoundLabel.trim()) return;
    if (rounds.length >= 2) {
      setError("Mỗi đợt đào tạo tối đa 2 đợt kiểm tra (Pre-test + Post-test).");
      return;
    }
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

  // "Chưa có bộ lọc hay gì đó để biết sau tập huấn bao nhiêu người pass, bao
  // nhiêu người học lại, danh sách" — đếm theo computePassStatus (1 nguồn
  // sự thật duy nhất với cột "Kết quả" và route xuất Excel) + bộ lọc để lọc
  // thẳng ra danh sách cần học lại.
  const statusByAttendeeId = useMemo(() => {
    const map = new Map<string, "pass" | "fail" | "none">();
    for (const a of attendees) map.set(a.id, computePassStatus(resultsByAttendee.get(a.id) || [], rounds, passThreshold, a.attended));
    return map;
  }, [attendees, resultsByAttendee, rounds, passThreshold]);
  const statusCounts = { pass: 0, fail: 0, none: 0 };
  for (const status of statusByAttendeeId.values()) statusCounts[status]++;

  const filteredAttendees = attendees.filter((a) => {
    if (query.trim() && ![a.employee_name, a.employee_code, a.department, a.job_title].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")))) return false;
    if (resultFilter !== "all" && statusByAttendeeId.get(a.id) !== resultFilter) return false;
    return true;
  });
  const detailAttendee = attendees.find((a) => a.id === detailAttendeeId) || null;
  const visibleAttendees = showAllAttendees ? filteredAttendees : filteredAttendees.slice(0, LIST_COLLAPSE_LIMIT);

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Đợt kiểm tra (Pre-test, Post-test)</h2>
            <p>Tối đa 2 đợt kiểm tra cho 1 đợt đào tạo: Post-test (bắt buộc nếu xét đạt) và Pre-test (tùy chọn, chỉ để đánh giá nền tảng trước học) — không mở thêm đợt khác.</p>
          </div>
        </div>
        <div className="ptd-round-list" style={{ padding: "0 19px 19px" }}>
          {rounds.map((r) => (
            <div className="ptd-round-row" key={r.id}>
              <div className="ptd-round-info">
                <strong>{r.round_label}</strong>
                {r.round_date ? <span className="muted tiny">{formatDate(r.round_date)}</span> : null}
              </div>
              {canManage ? (
                <div className="ptd-round-actions">
                  <button
                    type="button"
                    className={`button small ${r.is_open_for_submission ? "secondary is-open" : "primary"}`}
                    disabled={toggleBusyId === r.id || (!r.is_open_for_submission && !hasQuestions)}
                    onClick={() => void toggleRoundOpen(r)}
                    title={!r.is_open_for_submission && !hasQuestions ? "Soạn câu hỏi & đáp án ở tab Câu hỏi & đáp án trước khi mở" : "Bật/tắt cho nhân viên tự làm bài qua QR"}
                  >
                    {r.is_open_for_submission ? "Đang mở làm bài" : "Mở làm bài qua QR"}
                  </button>
                  <button type="button" className="button tertiary small" onClick={() => setQrRoundId(r.id)} aria-label={`Mã QR đợt ${r.round_label}`}>
                    <Icon name="qr-code" size={13} /> QR
                  </button>
                  <button type="button" className="button tertiary small" onClick={() => void removeRound(r)} aria-label={`Xoá đợt ${r.round_label}`}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : r.is_open_for_submission ? (
                <span className="status-badge success">Đang mở làm bài</span>
              ) : (
                <span className="status-badge muted">Chưa mở</span>
              )}
            </div>
          ))}
          {!rounds.length ? <p className="muted tiny">Chưa có đợt kiểm tra nào.</p> : null}
        </div>
        {canManage && rounds.length < 2 ? (
          <div className="ptd-round-add" style={{ padding: "0 19px 19px" }}>
            <input className="input" placeholder="Tên đợt kiểm tra (Pre-test hoặc Post-test)..." value={newRoundLabel} onChange={(e) => setNewRoundLabel(e.target.value)} />
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
          <a className="button secondary small" href={`/api/procedure-trainings/${trainingId}/export/excel`}>
            <Icon name="download" size={14} /> Xuất Excel
          </a>
        </div>
        {passThreshold != null ? (
          <div className="ptd-result-filter" style={{ padding: "0 19px 12px" }}>
            <button type="button" className={`button small ${resultFilter === "all" ? "primary" : "secondary"}`} onClick={() => setResultFilter("all")}>
              Tất cả ({attendees.length})
            </button>
            <button type="button" className={`button small ${resultFilter === "pass" ? "primary" : "secondary"}`} onClick={() => setResultFilter("pass")}>
              Đạt ({statusCounts.pass})
            </button>
            <button type="button" className={`button small ${resultFilter === "fail" ? "primary" : "secondary"}`} onClick={() => setResultFilter("fail")}>
              Không đạt — cần học lại ({statusCounts.fail})
            </button>
            <button type="button" className={`button small ${resultFilter === "none" ? "primary" : "secondary"}`} onClick={() => setResultFilter("none")}>
              Chưa có kết quả ({statusCounts.none})
            </button>
          </div>
        ) : null}
        <div style={{ padding: "0 19px 12px" }}>
          <input className="input" placeholder="Tìm tên, mã NV, đơn vị, chức danh..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canManage ? (
          <div className="ptd-attendee-add" style={{ padding: "0 19px 19px" }}>
            <input className="input" placeholder="Tên nhân viên..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
            <input className="input" placeholder="Mã NV (tùy chọn)" value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} />
            <select className="input" value={newDept} onChange={(e) => setNewDept(e.target.value)}>
              <option value="">— Đơn vị (tùy chọn) —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
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
                <th>STT</th>
                <th>Họ tên</th>
                <th>Mã NV</th>
                <th>Đơn vị</th>
                <th>Chức danh</th>
                <th>Đã đào tạo</th>
                {passThreshold != null ? <th>Kết quả</th> : null}
                {rounds.map((r) => (
                  <th key={r.id}>{r.round_label}</th>
                ))}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visibleAttendees.map((a, idx) => {
                const myResults = resultsByAttendee.get(a.id) || [];
                const editingDept = deptEdit?.attendeeId === a.id;
                const deptMismatch = isDeptMismatch(a.department);
                return (
                  <tr key={a.id}>
                    <td data-label="STT">{idx + 1}</td>
                    <td data-label="Họ tên">{a.employee_name}</td>
                    <td data-label="Mã NV">{a.employee_code || "—"}</td>
                    <td data-label="Đơn vị">
                      {editingDept ? (
                        <div className="ptd-dept-edit">
                          <select className="input" autoFocus value={deptEdit.value} onChange={(e) => setDeptEdit((v) => (v ? { ...v, value: e.target.value } : v))}>
                            <option value="">— Không có —</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.name}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <button className="button primary small" onClick={() => void saveDeptEdit()}>
                            Lưu
                          </button>
                          <button className="button tertiary small" onClick={() => setDeptEdit(null)}>
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="ptd-dept-cell" disabled={!canManage} onClick={() => startDeptEdit(a)}>
                          {a.department || "—"}
                          {deptMismatch ? (
                            <span className="status-badge warning" title="Đơn vị không khớp danh mục khoa/phòng đã cấu hình — bấm để xác nhận lại">
                              Cần xác nhận lại
                            </span>
                          ) : null}
                        </button>
                      )}
                    </td>
                    <td data-label="Chức danh">{a.job_title || "—"}</td>
                    {passThreshold != null ? (
                      <td data-label="Kết quả">
                        {(() => {
                          const status = computePassStatus(myResults, rounds, passThreshold, a.attended);
                          if (status === "none") return <span className="muted">—</span>;
                          return <span className={`status-badge ${status === "pass" ? "success" : "danger"}`}>{status === "pass" ? "Đạt" : "Không đạt — cần học lại"}</span>;
                        })()}
                      </td>
                    ) : null}
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
                  <td colSpan={7 + (passThreshold != null ? 1 : 0) + rounds.length} className="empty-state compact">
                    Chưa có nhân sự nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredAttendees.length > LIST_COLLAPSE_LIMIT ? (
          <div style={{ padding: "0 19px 19px" }}>
            <button type="button" className="button secondary small" onClick={() => setShowAllAttendees((v) => !v)}>
              {showAllAttendees ? "Thu gọn" : `Xem tất cả (${filteredAttendees.length})`}
            </button>
          </div>
        ) : null}
      </section>

      {detailAttendee ? (
        <AttendeeDetailPanel
          attendee={detailAttendee}
          results={resultsByAttendee.get(detailAttendee.id) || []}
          responsesByResult={responsesByResult}
          roundById={roundById}
          questions={questions}
          onClose={() => setDetailAttendeeId(null)}
        />
      ) : null}

      {qrRoundId ? <RoundQrModal round={roundById.get(qrRoundId) || null} onClose={() => setQrRoundId(null)} /> : null}

      <style jsx>{`
        .ptd-round-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ptd-round-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 11px 13px;
        }
        .ptd-round-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .ptd-round-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .ptd-round-actions .button.is-open {
          background: var(--success-soft);
          color: var(--success);
          border-color: transparent;
        }
        .ptd-round-add {
          display: grid;
          grid-template-columns: 2fr 1fr auto;
          gap: 8px;
        }
        .ptd-round-add > * {
          min-width: 0;
        }
        .ptd-result-filter {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
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
        .ptd-dept-edit {
          display: flex;
          gap: 4px;
          align-items: center;
          flex-wrap: wrap;
        }
        .ptd-dept-edit select {
          min-width: 160px;
        }
        .ptd-dept-cell {
          border: 0;
          background: transparent;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: inherit;
          color: inherit;
          text-align: left;
          padding: 0;
        }
        .ptd-dept-cell:disabled {
          cursor: default;
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
  questions,
  onClose,
}: {
  attendee: Attendee;
  results: ResultRow[];
  responsesByResult: Map<string, ResponseRow[]>;
  roundById: Map<string, Round>;
  questions: QuestionRow[];
  onClose: () => void;
}) {
  const questionByNo = useMemo(() => new Map(questions.map((q) => [q.question_no, q])), [questions]);
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
                      {qResponses.map((resp) => {
                        const q = questionByNo.get(resp.question_no);
                        const choices = q?.choices && q.choices.length > 1 ? q.choices : null;
                        return (
                          <li key={resp.question_no} className={resp.is_correct ? "is-correct" : "is-wrong"}>
                            <div className="ptd-response-head">
                              <strong>Câu {resp.question_no}</strong>
                              <span className={`status-badge ${resp.is_correct ? "success" : "danger"}`}>{resp.is_correct ? "Đúng" : "Sai"}</span>
                            </div>
                            {q?.question_text ? <p className="ptd-response-question">{q.question_text}</p> : null}
                            {choices ? (
                              <ul className="ptd-response-choices">
                                {choices.map((choice) => {
                                  const isChosen = choice === resp.answer_text;
                                  const isAnswerKey = q?.correct_answer ? choice === q.correct_answer : false;
                                  return (
                                    <li key={choice} className={isChosen ? (resp.is_correct ? "is-chosen-correct" : "is-chosen-wrong") : isAnswerKey ? "is-answer-key" : ""}>
                                      <span>{choice}</span>
                                      {isChosen ? <span className="ptd-choice-tag">Đã chọn</span> : null}
                                      {isAnswerKey && !isChosen ? <span className="ptd-choice-tag">Đáp án đúng</span> : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="ptd-response-answer">Trả lời: {resp.answer_text || "—"}</p>
                            )}
                          </li>
                        );
                      })}
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
          gap: 10px;
        }
        .ptd-response-list > li {
          display: grid;
          gap: 6px;
          font-size: 13px;
          padding: 10px 12px;
          border-radius: 8px;
          background: #f8fafb;
        }
        .ptd-response-list > li.is-wrong {
          background: var(--danger-soft, #fee2e2);
        }
        .ptd-response-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ptd-response-question {
          margin: 0;
          font-weight: 600;
          color: var(--text);
        }
        .ptd-response-answer {
          margin: 0;
          color: var(--muted);
        }
        .ptd-response-choices {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 4px;
        }
        .ptd-response-choices li {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 6px;
          background: #fff;
          border: 1px solid var(--line);
        }
        .ptd-response-choices li.is-chosen-correct {
          border-color: var(--success, #16a34a);
          background: var(--success-soft, #dcfce7);
          font-weight: 600;
        }
        .ptd-response-choices li.is-chosen-wrong {
          border-color: var(--danger, #dc2626);
          background: #fff;
          font-weight: 600;
          text-decoration: line-through;
        }
        .ptd-response-choices li.is-answer-key {
          border-color: var(--success, #16a34a);
          background: var(--success-soft, #dcfce7);
        }
        .ptd-choice-tag {
          font-size: 11px;
          font-weight: 700;
          padding: 1px 7px;
          border-radius: 20px;
          background: rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </div>
  );
}

// Mã QR dẫn tới trang công khai /lam-bai/[roundId] — nhân viên quét vào làm
// bài trực tiếp, không cần đăng nhập QARICA. Chỉ có tác dụng thật khi đợt
// đang "Mở làm bài" (is_open_for_submission), nên hiện rõ cảnh báo khi đang
// đóng để người in QR không hiểu nhầm là quét được ngay.
function RoundQrModal({ round, onClose }: { round: Round | null; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const link = round && typeof window !== "undefined" ? `${window.location.origin}/lam-bai/${round.id}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [link]);

  if (!round) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>Mã QR làm bài: {round.round_label}</h2>
            <p>Nhân viên quét mã này để làm bài trực tiếp, không cần đăng nhập.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
          {!round.is_open_for_submission ? <div className="alert error">Đợt này đang ĐÓNG — quét mã sẽ không làm bài được cho tới khi bật &quot;Mở làm bài qua QR&quot;.</div> : null}
          {qrDataUrl ? <img src={qrDataUrl} alt={`Mã QR làm bài ${round.round_label}`} width={220} height={220} /> : <div className="loading-state compact">Đang tạo mã QR...</div>}
          <code style={{ fontSize: 11, wordBreak: "break-all" }}>{link}</code>
          {qrDataUrl ? (
            <a className="button secondary small" download={`qr-lam-bai-${round.round_label}.png`} href={qrDataUrl}>
              <Icon name="download" size={15} /> Tải mã QR
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Đăng ký — đăng ký slot qua QR trước buổi đào tạo (khác hẳn "Nhân sự &
// điểm", là người ĐÃ tham gia/có điểm). Báo cáo thực tế: "cần bổ sung chức
// năng quét QR hoặc link đăng ký... vừa có thể kiểm soát ai đăng ký nhưng
// không đi học, ai không đăng ký theo số lượng nhân viên của khoa phòng."
// Đối chiếu đăng ký-vs-có mặt làm bằng so khớp mã NV/tên đã chuẩn hoá với
// danh sách attendees (không ép 1-1 cứng ở DB — xem migration). Số liệu
// "chưa đăng ký" theo khoa/phòng chỉ tính được khi khoa đó đã khai staff_count
// ở danh mục khoa/phòng (Quản lý > Khoa/Phòng) — bỏ qua nếu chưa khai.
function RegistrationTab({
  trainingId,
  isOpen,
  setTraining,
  registrations,
  setRegistrations,
  attendees,
  departments,
  roundById,
  canManage,
  setError,
}: {
  trainingId: string;
  isOpen: boolean;
  setTraining: (fn: (t: Training) => Training) => void;
  registrations: Registration[];
  setRegistrations: (fn: Registration[] | ((v: Registration[]) => Registration[])) => void;
  attendees: Attendee[];
  departments: Department[];
  roundById: Map<string, Round>;
  canManage: boolean;
  setError: (e: string) => void;
}) {
  const [toggleBusy, setToggleBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const link = typeof window !== "undefined" ? `${window.location.origin}/dang-ky-dao-tao/${trainingId}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [link]);

  async function toggleOpen() {
    setToggleBusy(true);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_open_for_registration: !isOpen }),
    });
    const body = await res.json().catch(() => ({}));
    setToggleBusy(false);
    if (!res.ok) {
      setError(body.error || "Không cập nhật được trạng thái đăng ký.");
      return;
    }
    setTraining((t) => ({ ...t, ...body.training }));
  }

  async function removeRegistration(r: Registration) {
    if (!window.confirm(`Xoá đăng ký của "${r.employee_name}"? Không thể hoàn tác.`)) return;
    setRemovingId(r.id);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/registrations/${r.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      setError(body.error || "Không xoá được đăng ký.");
      return;
    }
    setRegistrations((v) => v.filter((x) => x.id !== r.id));
  }

  // Đối chiếu: 1 người được coi "đã tham gia" nếu có attendee cùng mã NV đã
  // chuẩn hoá (ưu tiên), hoặc cùng tên (khi không có mã NV), và attendee đó
  // đã attended=true.
  function attendedStatus(r: Registration): "attended" | "registered_only" {
    const matched = attendees.find((a) => {
      if (r.employee_code && a.employee_code) return normalizeEmployeeCode(a.employee_code) === normalizeEmployeeCode(r.employee_code);
      return a.employee_name.trim().toLocaleLowerCase("vi") === r.employee_name.trim().toLocaleLowerCase("vi");
    });
    return matched?.attended ? "attended" : "registered_only";
  }

  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of registrations) {
      if (!r.department) continue;
      counts.set(r.department, (counts.get(r.department) || 0) + 1);
    }
    return departments
      .filter((d) => d.staff_count != null)
      .map((d) => ({ department: d, registered: counts.get(d.name) || 0 }))
      .filter((x) => x.registered < (x.department.staff_count as number));
  }, [registrations, departments]);

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Đăng ký tham gia đào tạo</h2>
          <p>Nhân viên tự quét QR đăng ký trước buổi đào tạo — đối chiếu được ai đăng ký nhưng không tới, và (khi khoa/phòng đã khai số nhân viên) khoa nào còn thiếu người đăng ký.</p>
        </div>
      </div>
      <div style={{ padding: "0 19px 19px", display: "grid", gap: 14 }}>
        <div className="ptd-registration-qr">
          {canManage ? (
            <button type="button" className={`ptd-registration-open-toggle${isOpen ? " is-open" : ""}`} disabled={toggleBusy} onClick={() => void toggleOpen()}>
              {isOpen ? "Đang mở đăng ký" : "Mở đăng ký qua QR"}
            </button>
          ) : (
            <span className={`status-badge ${isOpen ? "success" : "warning"}`}>{isOpen ? "Đang mở đăng ký" : "Chưa mở đăng ký"}</span>
          )}
          {isOpen ? (
            <>
              {qrDataUrl ? <img src={qrDataUrl} alt="Mã QR đăng ký đào tạo" width={140} height={140} /> : null}
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>{link}</code>
            </>
          ) : (
            <p className="muted tiny">Bật &quot;Mở đăng ký qua QR&quot; để tạo mã QR cho nhân viên quét đăng ký.</p>
          )}
        </div>

        {byDepartment.length ? (
          <div className="alert warning">
            <strong>Khoa/phòng còn thiếu người đăng ký:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {byDepartment.map(({ department, registered }) => (
                <li key={department.id}>
                  {department.name}: đã đăng ký {registered}/{department.staff_count} người
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Mã NV</th>
                <th>Buổi/đợt</th>
                <th>Đơn vị</th>
                <th>Chức danh</th>
                <th>Đăng ký lúc</th>
                <th>Trạng thái</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => {
                const status = attendedStatus(r);
                const round = r.round_id ? roundById.get(r.round_id) : null;
                return (
                  <tr key={r.id}>
                    <td data-label="Họ tên">{r.employee_name}</td>
                    <td data-label="Mã NV">{r.employee_code || "—"}</td>
                    <td data-label="Buổi/đợt">{round?.round_label || "—"}</td>
                    <td data-label="Đơn vị">{r.department || "—"}</td>
                    <td data-label="Chức danh">{r.job_title || "—"}</td>
                    <td data-label="Đăng ký lúc">{new Date(r.registered_at).toLocaleString("vi-VN")}</td>
                    <td data-label="Trạng thái">
                      <span className={`status-badge ${status === "attended" ? "success" : "warning"}`}>{status === "attended" ? "Đã tham gia" : "Đăng ký nhưng chưa tham gia"}</span>
                    </td>
                    {canManage ? (
                      <td data-label="Thao tác">
                        <button className="button tertiary small" disabled={removingId === r.id} onClick={() => void removeRegistration(r)}>
                          {removingId === r.id ? "Đang xoá..." : "Xóa"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!registrations.length ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="empty-state compact">
                    Chưa có ai đăng ký.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <style jsx>{`
        .ptd-registration-qr {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .ptd-registration-open-toggle {
          border: 1px solid var(--line);
          background: #fff;
          color: #46555c;
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .ptd-registration-open-toggle.is-open {
          background: var(--success-soft);
          color: var(--success);
          border-color: transparent;
        }
        .alert.warning {
          background: var(--warning-soft);
          color: #8a5a06;
          border: 1px solid #fbe3b0;
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Phân tích — điểm theo đợt, theo đơn vị/chức danh, độ khó từng câu
// (báo cáo thực tế: "chưa có phân tích kết quả theo đối tượng, trước sau").
// ---------------------------------------------------------------------------
function AnalysisTab({ rounds, attendees, results, responses, questions, passThreshold }: { rounds: Round[]; attendees: Attendee[]; results: ResultRow[]; responses: ResponseRow[]; questions: QuestionRow[]; passThreshold: number | null }) {
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);
  const [showAllHonor, setShowAllHonor] = useState(false);
  const attendeeById = useMemo(() => new Map(attendees.map((a) => [a.id, a])), [attendees]);

  const byRound = rounds.map((r) => {
    const scores = results.filter((res) => res.round_id === r.id && res.score != null).map((res) => res.score as number);
    return { round: r, count: scores.length, average: avg(scores) };
  });

  const sortedRounds = [...rounds].sort((a, b) => a.sort_order - b.sort_order);
  const firstRound = sortedRounds[0];
  const lastRound = sortedRounds[sortedRounds.length - 1];

  // Điểm trung bình theo đơn vị/chức danh CHỈ lấy điểm ĐỢT KIỂM TRA CUỐI
  // CÙNG (Post-test) — không gộp lẫn Pre-test. Theo đúng quy trình tập huấn
  // thật: Pre-test chỉ để giảng viên/ban tổ chức đánh giá nền tảng trước
  // học, không có giá trị xét công nhận/báo cáo; chỉ Post-test mới được
  // trích xuất để xét đạt và báo cáo theo đơn vị/chức danh. Gộp cả Pre lẫn
  // Post vào 1 điểm TB sẽ làm sai lệch số liệu báo cáo (Pre thường thấp hơn
  // Post, kéo điểm TB xuống dù chất lượng đào tạo thực tế không như vậy).
  // "Khoa Ung Bướu và Khoa Ung bướu gộp lại" — nhóm theo đơn vị/chức danh
  // phải gộp không phân biệt hoa/thường (chữ viết tay tự do, không phải
  // chọn từ danh mục chuẩn ở mọi nơi nhập liệu cũ) — chuẩn hoá khoá nhóm,
  // vẫn hiện tên theo đúng chữ hoa/thường đầu tiên gặp để không tự ý đổi
  // dữ liệu người dùng đã nhập.
  function groupBy(getKey: (a: Attendee) => string | null) {
    const groups = new Map<string, { label: string; rows: { attendeeId: string; score: number }[] }>();
    if (!lastRound) return [];
    for (const res of results) {
      if (res.score == null || res.round_id !== lastRound.id) continue;
      const a = attendeeById.get(res.attendee_id);
      if (!a) continue;
      const label = (getKey(a) || "Chưa phân loại").trim();
      const normKey = label.toLocaleLowerCase("vi");
      const g = groups.get(normKey) || { label, rows: [] };
      g.rows.push({ attendeeId: res.attendee_id, score: res.score });
      groups.set(normKey, g);
    }
    return Array.from(groups.values())
      .map(({ label, rows }) => ({ key: label, count: rows.length, average: avg(rows.map((r) => r.score)) }))
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  }
  const byDept = groupBy((a) => a.department);
  const byTitle = groupBy((a) => a.job_title);

  const beforeAfter =
    firstRound && lastRound && firstRound.id !== lastRound.id
      ? groupByBeforeAfter(attendees, results, firstRound.id, lastRound.id)
      : null;
  // "So sánh trước/sau theo CHỨC DANH" — cùng groupByBeforeAfter dùng chung
  // với theo đơn vị, chỉ đổi getKey sang job_title (1 nguồn sự thật duy
  // nhất, không viết lại logic gộp/tính delta lần 2).
  const beforeAfterByTitle =
    firstRound && lastRound && firstRound.id !== lastRound.id
      ? groupByBeforeAfter(attendees, results, firstRound.id, lastRound.id, (a) => a.job_title)
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

  // "Chuyển thành biểu đồ cột % trước sau để biết tăng bao nhiêu %" — Điểm
  // TB theo đợt quy ra % trên thang điểm (round.score_max) thay vì so trực
  // tiếp 2 số điểm thô, kèm 1 dòng chú thích tăng/giảm bao nhiêu % giữa đợt
  // đầu và đợt cuối (Pre→Post).
  const roundPctRows = byRound.map(({ round, count, average }) => ({
    round,
    count,
    average,
    pct: round.score_max && average != null ? Math.round((average / round.score_max) * 1000) / 10 : null,
  }));
  const roundChartRows = roundPctRows
    .filter((r) => r.pct != null)
    .map((r) => ({ label: r.round.round_label, value: r.pct as number, tone: "blue" as const }));
  const firstRoundPct = firstRound ? (roundPctRows.find((r) => r.round.id === firstRound.id)?.pct ?? null) : null;
  const lastRoundPct = lastRound ? (roundPctRows.find((r) => r.round.id === lastRound.id)?.pct ?? null) : null;
  const pctDelta =
    firstRound && lastRound && firstRound.id !== lastRound.id && firstRoundPct != null && lastRoundPct != null
      ? Math.round((lastRoundPct - firstRoundPct) * 10) / 10
      : null;

  const deptChartRows = byDept.filter((d) => d.average != null).map((d) => ({ label: d.key, value: Math.round((d.average as number) * 100) / 100, tone: "brand" as const }));
  const titleChartRows = byTitle.filter((d) => d.average != null).map((d) => ({ label: d.key, value: Math.round((d.average as number) * 100) / 100, tone: "blue" as const }));
  const questionChartRows = questionDifficulty
    .filter((q) => q.pctCorrect != null)
    .map((q) => ({
      label: `Câu ${q.questionNo}`,
      value: q.pctCorrect as number,
      tone: (q.pctCorrect as number) < 60 ? ("red" as const) : (q.pctCorrect as number) < 80 ? ("amber" as const) : ("green" as const),
    }));

  // "Thống kê danh sách kiểm tra điểm cao nhất xuống thấp nhất để dùng
  // tuyên dương" — xếp hạng theo điểm ĐỢT KIỂM TRA CUỐI CÙNG (cùng khái
  // niệm "đợt cuối" với computePassStatus, 1 nguồn sự thật duy nhất), chỉ
  // xếp người đã có điểm ở đợt đó; hạng kiểu thi đấu (điểm bằng nhau cùng
  // hạng, hạng tiếp theo nhảy đúng số người).
  const leaderboard = lastRound
    ? attendees
        .map((a) => {
          const r = results.find((res) => res.round_id === lastRound.id && res.attendee_id === a.id && res.score != null);
          return r ? { attendeeId: a.id, name: a.employee_name, department: a.department, jobTitle: a.job_title, score: r.score as number } : null;
        })
        .filter((x): x is { attendeeId: string; name: string; department: string | null; jobTitle: string | null; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .map((row, _i, arr) => ({ ...row, rank: 1 + arr.filter((x) => x.score > row.score).length }))
    : [];

  // "Tuyên dương" toàn bộ người đạt điểm TUYỆT ĐỐI (= score_max đợt cuối),
  // không giới hạn top 3 như bảng xếp hạng — nhiều người có thể cùng đạt
  // 100%. Lọc từ leaderboard có sẵn (đã có điểm đợt cuối), không truy vấn
  // lại.
  const maxScoreAchievers = lastRound && lastRound.score_max != null ? leaderboard.filter((row) => row.score === lastRound.score_max) : [];

  const totalSubmissions = byRound.reduce((s, b) => s + b.count, 0);

  return (
    <>
      {byRound.length ? (
        <div className="kpi-grid ptd-analysis-kpis">
          <KpiCard icon="users" tone="purple" label="Tổng lượt làm bài" value={totalSubmissions} />
          {byRound.map((b, i) => (
            <KpiCard key={b.round.id} icon="clipboard-check" tone={i === byRound.length - 1 ? "green" : "blue"} label={b.round.round_label} value={b.count} />
          ))}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Điểm trung bình theo đợt kiểm tra (% thang điểm)</h2>
            {pctDelta != null ? (
              <p>
                <span className={pctDelta >= 0 ? "text-success" : "text-danger"}>
                  {pctDelta >= 0 ? "Tăng" : "Giảm"} {Math.abs(pctDelta)} điểm % ({firstRoundPct}% → {lastRoundPct}%)
                </span>{" "}
                từ {firstRound!.round_label} sang {lastRound!.round_label}.
              </p>
            ) : null}
          </div>
        </div>
        {roundChartRows.length ? <TqmColumnBars rows={roundChartRows} max={100} unit="%" /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đợt</th>
                <th>Số người có điểm</th>
                <th>Điểm TB</th>
                <th>% thang điểm</th>
              </tr>
            </thead>
            <tbody>
              {roundPctRows.map(({ round, count, average, pct }) => (
                <tr key={round.id}>
                  <td data-label="Đợt">{round.round_label}</td>
                  <td data-label="Số người có điểm">{count}</td>
                  <td data-label="Điểm TB">{average != null ? `${average.toFixed(2)}${round.score_max ? `/${round.score_max}` : ""}` : "—"}</td>
                  <td data-label="% thang điểm">{pct != null ? `${pct}%` : "—"}</td>
                </tr>
              ))}
              {!byRound.length ? (
                <tr>
                  <td colSpan={4} className="empty-state compact">
                    Chưa có đợt kiểm tra nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {lastRound && leaderboard.length ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Bảng xếp hạng điểm ({lastRound.round_label})</h2>
              <p>Xếp từ cao xuống thấp theo điểm đợt kiểm tra cuối cùng — dùng để tuyên dương.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hạng</th>
                  <th>Họ tên</th>
                  <th>Đơn vị</th>
                  <th>Chức danh</th>
                  <th>Điểm</th>
                </tr>
              </thead>
              <tbody>
                {(showAllLeaderboard ? leaderboard : leaderboard.slice(0, LIST_COLLAPSE_LIMIT)).map((row) => (
                  <tr key={row.attendeeId}>
                    <td data-label="Hạng">{row.rank <= 3 ? <span className={`status-badge ${row.rank === 1 ? "success" : "info"}`}>#{row.rank}</span> : row.rank}</td>
                    <td data-label="Họ tên">{row.name}</td>
                    <td data-label="Đơn vị">{row.department || "—"}</td>
                    <td data-label="Chức danh">{row.jobTitle || "—"}</td>
                    <td data-label="Điểm">
                      {row.score}
                      {lastRound.score_max ? `/${lastRound.score_max}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leaderboard.length > LIST_COLLAPSE_LIMIT ? (
            <div style={{ padding: "0 19px 19px" }}>
              <button type="button" className="button secondary small" onClick={() => setShowAllLeaderboard((v) => !v)}>
                {showAllLeaderboard ? "Thu gọn" : `Xem tất cả (${leaderboard.length})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {lastRound && lastRound.score_max != null && maxScoreAchievers.length ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tuyên dương — đạt điểm tuyệt đối ({lastRound.round_label})</h2>
              <p>
                Chúc mừng {maxScoreAchievers.length} học viên đạt {lastRound.score_max}/{lastRound.score_max} điểm (100%).
              </p>
            </div>
          </div>
          <div className="ptd-honor-grid" style={{ padding: "0 19px 19px" }}>
            {(showAllHonor ? maxScoreAchievers : maxScoreAchievers.slice(0, LIST_COLLAPSE_LIMIT)).map((row) => (
              <div className="ptd-honor-card" key={row.attendeeId}>
                <span className="ptd-honor-badge">
                  <Icon name="badge-check" size={26} />
                </span>
                <strong>{row.name}</strong>
                <span className="muted tiny">{row.jobTitle || row.department || "—"}</span>
                <span className="status-badge success">
                  {row.score}/{lastRound.score_max} (100%)
                </span>
              </div>
            ))}
          </div>
          {maxScoreAchievers.length > LIST_COLLAPSE_LIMIT ? (
            <div style={{ padding: "0 19px 19px" }}>
              <button type="button" className="button secondary small" onClick={() => setShowAllHonor((v) => !v)}>
                {showAllHonor ? "Thu gọn" : `Xem tất cả (${maxScoreAchievers.length})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

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
          {beforeAfter.length ? (
            <TqmGroupedBars
              groups={beforeAfter.map((r) => ({ label: r.key, before: r.before, after: r.after }))}
              beforeLabel={firstRound!.round_label}
              afterLabel={lastRound!.round_label}
              threshold={passThreshold}
              thresholdLabel="Mức đạt"
            />
          ) : null}
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

      {beforeAfterByTitle ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>So sánh trước/sau theo chức danh</h2>
              <p>
                {firstRound!.round_label} → {lastRound!.round_label}
              </p>
            </div>
          </div>
          {beforeAfterByTitle.length ? (
            <TqmGroupedBars
              groups={beforeAfterByTitle.map((r) => ({ label: r.key, before: r.before, after: r.after }))}
              beforeLabel={firstRound!.round_label}
              afterLabel={lastRound!.round_label}
              threshold={passThreshold}
              thresholdLabel="Mức đạt"
            />
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chức danh</th>
                  <th>{firstRound!.round_label} (TB)</th>
                  <th>{lastRound!.round_label} (TB)</th>
                  <th>Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {beforeAfterByTitle.map((row) => (
                  <tr key={row.key}>
                    <td data-label="Chức danh">{row.key}</td>
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
          <div>
            <h2>Điểm trung bình theo đơn vị</h2>
            <p>Chỉ tính điểm {lastRound ? lastRound.round_label : "đợt kiểm tra cuối cùng"} (Post-test) — không gộp Pre-test.</p>
          </div>
        </div>
        {deptChartRows.length ? <TqmColumnBars rows={deptChartRows} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Đơn vị</th>
                <th>Số người có điểm</th>
                <th>Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {byDept.map((row) => (
                <tr key={row.key}>
                  <td data-label="Đơn vị">{row.key}</td>
                  <td data-label="Số người có điểm">{row.count}</td>
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
          <div>
            <h2>Điểm trung bình theo chức danh</h2>
            <p>Chỉ tính điểm {lastRound ? lastRound.round_label : "đợt kiểm tra cuối cùng"} (Post-test) — không gộp Pre-test.</p>
          </div>
        </div>
        {titleChartRows.length ? <TqmColumnBars rows={titleChartRows} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chức danh</th>
                <th>Số người có điểm</th>
                <th>Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {byTitle.map((row) => (
                <tr key={row.key}>
                  <td data-label="Chức danh">{row.key}</td>
                  <td data-label="Số người có điểm">{row.count}</td>
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
          {questionChartRows.length ? <TqmColumnBars rows={questionChartRows} max={100} unit="%" /> : null}
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
        .ptd-analysis-kpis {
          grid-template-columns: repeat(auto-fit, minmax(170px, 230px));
        }
        .ptd-honor-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px;
        }
        .ptd-honor-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          width: 200px;
          border: 1px solid #f0d58a;
          border-radius: 16px;
          padding: 22px 14px 18px;
          background: linear-gradient(180deg, #fffaf0 0%, #fdf1d6 100%);
          box-shadow: 0 3px 12px rgba(180, 131, 6, 0.1);
        }
        .ptd-honor-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(180deg, #ffe49a 0%, #ffcf5c 100%);
          color: #8a5a00;
          box-shadow: 0 2px 6px rgba(180, 131, 6, 0.25);
        }
        .ptd-honor-card strong {
          color: var(--text);
          font-size: 15px;
        }
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

function groupByBeforeAfter(attendees: Attendee[], results: ResultRow[], beforeRoundId: string, afterRoundId: string, getKey: (a: Attendee) => string | null = (a) => a.department) {
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  // Chuẩn hoá khoá nhóm (không phân biệt hoa/thường) — cùng lý do với
  // groupBy() trong AnalysisTab: tránh "Khoa Ung Bướu" và "Khoa Ung bướu"
  // tách thành 2 dòng/2 cột khác nhau trên biểu đồ.
  const groups = new Map<string, { label: string; before: number[]; after: number[] }>();
  for (const res of results) {
    if (res.score == null) continue;
    if (res.round_id !== beforeRoundId && res.round_id !== afterRoundId) continue;
    const a = attendeeById.get(res.attendee_id);
    if (!a) continue;
    const label = (getKey(a) || "Chưa phân loại").trim();
    const normKey = label.toLocaleLowerCase("vi");
    const g = groups.get(normKey) || { label, before: [], after: [] };
    if (res.round_id === beforeRoundId) g.before.push(res.score);
    else g.after.push(res.score);
    groups.set(normKey, g);
  }
  return Array.from(groups.values())
    .map((g) => {
      const before = avg(g.before);
      const after = avg(g.after);
      return { key: g.label, before, after, delta: before != null && after != null ? after - before : null };
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
  setQuestions: (v: QuestionRow[] | ((prev: QuestionRow[]) => QuestionRow[])) => void;
  canManage: boolean;
  setError: (e: string) => void;
}) {
  // Báo cáo thực tế: "bỏ phần chung ở trên, chỉ cần phần nội dung câu hỏi và
  // đáp án, và chọn đáp án đúng luôn, không phải nhập 2 lần" — trước đây có
  // 1 ô dán danh sách đáp án đúng hàng loạt (để chấm điểm) TÁCH RIÊNG khỏi
  // từng câu (nội dung + lựa chọn) ở dưới, nên cùng 1 đáp án phải gõ 2 chỗ.
  // Giờ mỗi câu tự chọn đáp án đúng ngay trong danh sách lựa chọn của chính
  // nó (radio) — gõ 1 lần duy nhất. "draftNos" là các câu mới thêm nhưng
  // chưa lưu (chưa gọi API) — chỉ tạo hàng thật khi bấm "Lưu câu này".
  const [draftNos, setDraftNos] = useState<number[]>([]);

  function addDraft() {
    const maxNo = Math.max(0, ...questions.map((q) => q.question_no), ...draftNos);
    setDraftNos((v) => [...v, maxNo + 1]);
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Câu hỏi & đáp án</h2>
          <p>Soạn từng câu: nội dung câu hỏi, các lựa chọn, và chọn luôn đáp án đúng trong số đó — dùng để tự chấm điểm và cho nhân viên tự làm bài qua QR.</p>
        </div>
      </div>
      <div style={{ padding: "0 19px 19px", display: "grid", gap: 14 }}>
        {questions.map((q) => (
          <QuestionEditorRow
            key={q.question_no}
            trainingId={trainingId}
            question={q}
            questionNo={q.question_no}
            canManage={canManage}
            onSaved={(updated) => setQuestions((prev) => prev.map((x) => (x.question_no === updated.question_no ? updated : x)))}
            onDeleted={() => setQuestions((prev) => prev.filter((x) => x.question_no !== q.question_no))}
            setError={setError}
          />
        ))}
        {draftNos.map((no) => (
          <QuestionEditorRow
            key={`draft-${no}`}
            trainingId={trainingId}
            question={null}
            questionNo={no}
            canManage={canManage}
            onSaved={(created) => {
              setQuestions((prev) => [...prev, created].sort((a, b) => a.question_no - b.question_no));
              setDraftNos((v) => v.filter((n) => n !== no));
            }}
            onCancelDraft={() => setDraftNos((v) => v.filter((n) => n !== no))}
            setError={setError}
          />
        ))}
        {!questions.length && !draftNos.length ? <p className="empty-state compact">Chưa có câu hỏi nào.</p> : null}
        {canManage ? (
          <button type="button" className="button secondary" onClick={addDraft} style={{ justifySelf: "start" }}>
            + Thêm câu hỏi
          </button>
        ) : null}
      </div>
    </section>
  );
}

// 1 câu hỏi: nội dung + danh sách lựa chọn + chọn đáp án đúng ngay trong số
// lựa chọn đó (radio) — hoặc gõ thẳng đáp án đúng khi không dùng trắc
// nghiệm (dưới 2 lựa chọn). `question=null` là câu mới chưa lưu (POST khi
// lưu lần đầu), khác với sửa câu đã có (PATCH).
function QuestionEditorRow({
  trainingId,
  question,
  questionNo,
  canManage,
  onSaved,
  onDeleted,
  onCancelDraft,
  setError,
}: {
  trainingId: string;
  question: QuestionRow | null;
  questionNo: number;
  canManage: boolean;
  onSaved: (q: QuestionRow) => void;
  onDeleted?: () => void;
  onCancelDraft?: () => void;
  setError: (e: string) => void;
}) {
  const isDraft = question === null;
  const hasChoices = !!question?.choices && question.choices.length > 1;
  const [questionText, setQuestionText] = useState(question?.question_text || "");
  const [choices, setChoices] = useState<string[]>(hasChoices ? [...(question!.choices as string[])] : []);
  const [correctIndex, setCorrectIndex] = useState<number | null>(() => {
    if (!hasChoices) return null;
    const idx = (question!.choices as string[]).findIndex((c) => c === question!.correct_answer);
    return idx >= 0 ? idx : null;
  });
  const [freeTextAnswer, setFreeTextAnswer] = useState(hasChoices ? "" : question?.correct_answer || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localError, setLocalError] = useState("");
  // Câu đã lưu mặc định bị KHÓA (chỉ xem) — tránh bấm nhầm đổi đáp án đã
  // chốt; phải bấm "Sửa" mới mở lại form chỉnh sửa. Câu mới (draft) thì mở
  // sẵn vì chưa có gì để khóa.
  const [editing, setEditing] = useState(isDraft);

  const isChoiceMode = choices.filter((c) => c.trim()).length >= 2;

  function updateChoice(i: number, value: string) {
    setChoices((v) => v.map((c, idx) => (idx === i ? value : c)));
  }
  function addChoice() {
    setChoices((v) => [...v, ""]);
  }
  function removeChoice(i: number) {
    setChoices((v) => v.filter((_, idx) => idx !== i));
    setCorrectIndex((cur) => (cur === null ? cur : cur === i ? null : cur > i ? cur - 1 : cur));
  }

  async function save() {
    setLocalError("");
    let correctAnswer = "";
    let finalChoices: string[] = [];
    if (isChoiceMode) {
      if (correctIndex === null || !choices[correctIndex]?.trim()) {
        setLocalError("Chưa chọn đáp án đúng trong các lựa chọn.");
        return;
      }
      correctAnswer = choices[correctIndex].trim();
      finalChoices = choices.map((c) => c.trim()).filter(Boolean);
    } else {
      correctAnswer = freeTextAnswer.trim();
      if (!correctAnswer) {
        setLocalError("Chưa nhập đáp án đúng.");
        return;
      }
    }
    setSaving(true);
    setError("");
    const res = await fetch(isDraft ? `/api/procedure-trainings/${trainingId}/questions` : `/api/procedure-trainings/${trainingId}/questions/${questionNo}`, {
      method: isDraft ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_text: questionText, choices: finalChoices, correct_answer: correctAnswer }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Không lưu được câu hỏi.");
      return;
    }
    onSaved(body.question as QuestionRow);
    if (!isDraft) setEditing(false);
  }

  function cancelEdit() {
    setLocalError("");
    setQuestionText(question?.question_text || "");
    const hc = !!question?.choices && question.choices.length > 1;
    setChoices(hc ? [...(question!.choices as string[])] : []);
    setCorrectIndex(() => {
      if (!hc) return null;
      const idx = (question!.choices as string[]).findIndex((c) => c === question!.correct_answer);
      return idx >= 0 ? idx : null;
    });
    setFreeTextAnswer(hc ? "" : question?.correct_answer || "");
    setEditing(false);
  }

  async function remove() {
    if (!window.confirm(`Xoá câu ${questionNo}? Không thể hoàn tác.`)) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/procedure-trainings/${trainingId}/questions/${questionNo}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setError(body.error || "Không xoá được câu hỏi.");
      return;
    }
    onDeleted?.();
  }

  return (
    <fieldset>
      <legend>{isDraft ? `Câu mới (#${questionNo})` : `Câu ${questionNo}`}</legend>
      {!editing ? (
        <div className="ptd-question-locked">
          <p className="ptd-question-locked-text">{question?.question_text}</p>
          <ul className="ptd-choice-list-locked">
            {(isChoiceMode ? choices : [freeTextAnswer]).map((c, i) => (
              <li key={i} className={c === question?.correct_answer ? "correct" : undefined}>
                {c === question?.correct_answer ? "✓ " : ""}
                {c}
              </li>
            ))}
          </ul>
          {canManage ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="button secondary small" onClick={() => setEditing(true)}>
                Sửa
              </button>
              <button type="button" className="button tertiary small" disabled={deleting} onClick={() => void remove()}>
                {deleting ? "Đang xoá..." : "Xoá câu hỏi"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <input disabled={!canManage} placeholder="Nội dung câu hỏi..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
          <div className="ptd-choice-list">
            {choices.map((c, i) => (
              <label key={i} className="ptd-choice-row">
                <input type="radio" name={`correct-${questionNo}`} checked={correctIndex === i} onChange={() => setCorrectIndex(i)} disabled={!canManage || !c.trim()} />
                <input className="ptd-choice-text" disabled={!canManage} placeholder={`Lựa chọn ${i + 1}...`} value={c} onChange={(e) => updateChoice(i, e.target.value)} />
                {canManage ? (
                  <button type="button" aria-label={`Xoá lựa chọn ${i + 1}`} onClick={() => removeChoice(i)}>
                    ×
                  </button>
                ) : null}
              </label>
            ))}
            {canManage ? (
              <button type="button" className="button tertiary small" onClick={addChoice} style={{ justifySelf: "start" }}>
                + Thêm lựa chọn
              </button>
            ) : null}
          </div>
          {!isChoiceMode ? (
            <label className="ptd-free-answer">
              <span>Đáp án đúng (cần ít nhất 2 lựa chọn ở trên để chuyển sang trắc nghiệm):</span>
              <input disabled={!canManage} placeholder="Đáp án đúng..." value={freeTextAnswer} onChange={(e) => setFreeTextAnswer(e.target.value)} />
            </label>
          ) : null}
          {localError ? <p className="ptd-question-error">{localError}</p> : null}
          {canManage ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button secondary small" disabled={saving} onClick={() => void save()}>
                {saving ? "Đang lưu..." : "Lưu câu này"}
              </button>
              {isDraft ? (
                <button type="button" className="button tertiary small" onClick={onCancelDraft}>
                  Hủy
                </button>
              ) : (
                <button type="button" className="button tertiary small" onClick={cancelEdit}>
                  Hủy
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
      <style jsx>{`
        .ptd-choice-list {
          display: grid;
          gap: 6px;
        }
        .ptd-choice-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ptd-choice-row input[type="radio"] {
          width: auto;
          min-height: 0;
          flex: 0 0 auto;
        }
        .ptd-choice-text {
          flex: 1;
          min-width: 0;
        }
        .ptd-choice-row > button {
          border: 0;
          background: transparent;
          cursor: pointer;
          font-weight: 800;
          color: var(--danger, #dc2626);
        }
        .ptd-free-answer {
          display: grid;
          gap: 4px;
          font-size: 12px;
          color: var(--muted);
        }
        .ptd-question-error {
          margin: 0;
          font-size: 12px;
          color: var(--danger, #dc2626);
          font-weight: 600;
        }
        .ptd-question-locked {
          display: grid;
          gap: 8px;
        }
        .ptd-question-locked-text {
          margin: 0;
          font-weight: 600;
        }
        .ptd-choice-list-locked {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
          color: var(--muted);
        }
        .ptd-choice-list-locked li.correct {
          color: var(--brand, #1d4ed8);
          font-weight: 700;
        }
      `}</style>
    </fieldset>
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
        .ptd-import-row input[type="checkbox"] {
          width: auto;
          min-height: 0;
          flex: 0 0 auto;
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
