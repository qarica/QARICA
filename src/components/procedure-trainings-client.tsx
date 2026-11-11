"use client";

import Link from "next/link";
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
  document_publication_id: string | null;
  source_document: { id: string; title: string; document_code: string | null } | null;
  test_score_max: number | null;
};

type Attendee = {
  id: string;
  training_id: string;
  employee_name: string;
  employee_code: string | null;
  attended: boolean;
  attended_at: string | null;
  notes: string | null;
  pre_test_score: number | null;
  post_test_score: number | null;
};

// Bản xem trước khi nhập điểm Pre/Post-test từ file khảo sát (Google/
// Microsoft Form) — khớp với ImportAction ở src/lib/training-import.ts,
// cộng thêm `included` (checkbox bỏ dòng ra khỏi lần lưu) chỉ tồn tại ở UI.
type ImportActionPreview =
  | {
      type: "insert";
      key: string;
      employeeName: string;
      employeeCode: string | null;
      dept: string | null;
      title: string | null;
      preScore: number | null;
      postScore: number | null;
      included: boolean;
    }
  | {
      type: "update";
      key: string;
      attendeeId: string;
      employeeName: string;
      preScore: number | null;
      postScore: number | null;
      preConflict: boolean;
      postConflict: boolean;
      included: boolean;
    };

// Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối với
// kiểm soát tài liệu... nên làm menu theo dõi gồm cả 2 nội dung [Tự đọc
// hiểu + Cần đào tạo] để control chứ ko đưa phần xác nhận vào thư viện văn
// bản" — "Tự đọc hiểu" dời từ document-publications-client.tsx sang đây
// nguyên vẹn logic (ackCount/hasAcked/unconfirmedStaff/acknowledge), chỉ đổi
// nơi hiển thị. SelfReadDocument chỉ cần 4 cột hiển thị, không cần toàn bộ
// shape DocumentPublication (loại/bước/đơn vị soạn thảo... không liên quan
// tới việc xác nhận đã đọc).
type SelfReadDocument = { id: string; title: string; document_code: string | null; version_label: string; effective_date: string | null };
type Acknowledgment = { document_publication_id: string; user_id: string };
type Staff = { id: string; name: string };

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

export function ProcedureTrainingsClient({
  initialTrainings,
  canManage,
  selfReadDocuments,
  acknowledgments,
  staffRoster,
  currentUserId,
  canManageDocuments,
}: {
  initialTrainings: Training[];
  canManage: boolean;
  selfReadDocuments: SelfReadDocument[];
  acknowledgments: Acknowledgment[];
  staffRoster: Staff[];
  currentUserId: string;
  canManageDocuments: boolean;
}) {
  const [view, setView] = useState<"training" | "self_read">("training");
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [trainings, setTrainings] = useState(initialTrainings);
  const [listQuery, setListQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [acks, setAcks] = useState(acknowledgments);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [unconfirmedOpenId, setUnconfirmedOpenId] = useState<string | null>(null);
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
  const [newPreScore, setNewPreScore] = useState("");
  const [newPostScore, setNewPostScore] = useState("");
  const [scoreEditId, setScoreEditId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<{ pre: string; post: string }>({ pre: "", post: "" });
  const [maxScoreEditing, setMaxScoreEditing] = useState(false);
  const [maxScoreDraft, setMaxScoreDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [answerKeyText, setAnswerKeyText] = useState("");
  const [answerKeySaving, setAnswerKeySaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDefaultGroup, setImportDefaultGroup] = useState<"PRE" | "POST">("PRE");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportActionPreview[] | null>(null);
  const [importMeta, setImportMeta] = useState<{ rowCount: number; questionCount: number; hasAnswerKey: boolean; hasGroupColumn: boolean; scoringSkippedCount: number } | null>(null);
  const [importCommitBusy, setImportCommitBusy] = useState(false);
  const [importResult, setImportResult] = useState("");

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

  const ackCount = (documentId: string) => acks.filter((a) => a.document_publication_id === documentId).length;
  const hasAcked = (documentId: string) => acks.some((a) => a.document_publication_id === documentId && a.user_id === currentUserId);
  // Chưa xác nhận = toàn bộ nhân sự đang hoạt động - những ai đã có trong acks.
  const unconfirmedStaff = (documentId: string) => {
    const ackedIds = new Set(acks.filter((a) => a.document_publication_id === documentId).map((a) => a.user_id));
    return staffRoster.filter((s) => !ackedIds.has(s.id));
  };

  async function acknowledge(doc: SelfReadDocument) {
    setAcknowledging(doc.id);
    setError("");
    const res = await fetch(`/api/document-publications/${doc.id}/acknowledge`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setAcknowledging(null);
    if (!res.ok) {
      setError(body.error || "Không xác nhận được.");
      return;
    }
    setAcks((v) => [...v, { document_publication_id: doc.id, user_id: currentUserId }]);
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
    setNewPreScore("");
    setNewPostScore("");
    setScoreEditId(null);
    setMaxScoreEditing(false);
    setMaxScoreDraft(t.test_score_max != null ? String(t.test_score_max) : "");
    setImportOpen(false);
    setAnswerKeyText("");
    setImportFile(null);
    setImportError("");
    setImportPreview(null);
    setImportMeta(null);
    setImportResult("");
    fetch(`/api/procedure-trainings/${t.id}/questions`)
      .then((res) => res.json())
      .then((body) => setAnswerKeyText(((body.questions || []) as { correct_answer: string }[]).map((q) => q.correct_answer).join("\n")))
      .catch(() => {});
  }

  function closeRoster() {
    setRosterTraining(null);
    setRosterAttendees([]);
  }

  async function saveAnswerKey() {
    if (!rosterTraining) return;
    setAnswerKeySaving(true);
    setImportError("");
    const answers = answerKeyText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const body = await res.json().catch(() => ({}));
    setAnswerKeySaving(false);
    if (!res.ok) {
      setImportError(body.error || "Không lưu được đáp án.");
      return;
    }
    setAnswerKeyText(((body.questions || []) as { correct_answer: string }[]).map((q) => q.correct_answer).join("\n"));
  }

  async function previewImport() {
    if (!rosterTraining || !importFile) return;
    setImportBusy(true);
    setImportError("");
    setImportPreview(null);
    setImportResult("");
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("default_group", importDefaultGroup);
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/import`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setImportBusy(false);
    if (!res.ok) {
      setImportError(body.error || "Không đọc được file.");
      return;
    }
    setImportPreview(((body.actions || []) as Omit<ImportActionPreview, "included">[]).map((a) => ({ ...a, included: true }) as ImportActionPreview));
    setImportMeta({ rowCount: body.rowCount, questionCount: body.questionCount, hasAnswerKey: body.hasAnswerKey, hasGroupColumn: body.hasGroupColumn, scoringSkippedCount: body.scoringSkippedCount });
  }

  function toggleImportRow(key: string) {
    setImportPreview((v) => (v ? v.map((a) => (a.key === key ? { ...a, included: !a.included } : a)) : v));
  }

  async function commitImport() {
    if (!rosterTraining || !importPreview) return;
    setImportCommitBusy(true);
    setImportError("");
    const actions = importPreview
      .filter((a) => a.included)
      .map((a) =>
        a.type === "insert"
          ? { type: "insert", employeeName: a.employeeName, employeeCode: a.employeeCode, dept: a.dept, title: a.title, preScore: a.preScore, postScore: a.postScore }
          : { type: "update", attendeeId: a.attendeeId, employeeName: a.employeeName, preScore: a.preScore, postScore: a.postScore },
      );
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/import/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const body = await res.json().catch(() => ({}));
    setImportCommitBusy(false);
    if (!res.ok) {
      setImportError(body.error || "Không lưu được.");
      return;
    }
    setImportResult(`Đã thêm ${body.insertedCount} người mới, cập nhật ${body.updatedCount} người.${body.errors?.length ? ` (${body.errors.length} dòng bị bỏ qua, xem lại dữ liệu)` : ""}`);
    setImportPreview(null);
    setImportMeta(null);
    setImportFile(null);
    const refreshed = await fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees`)
      .then((res2) => res2.json())
      .catch(() => null);
    if (refreshed?.attendees) {
      setRosterAttendees(refreshed.attendees);
      syncRosterCounts(rosterTraining.id, refreshed.attendees);
    }
  }

  async function saveMaxScore() {
    if (!rosterTraining) return;
    setRosterError("");
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test_score_max: maxScoreDraft.trim() === "" ? null : Number(maxScoreDraft) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRosterError(body.error || "Không lưu được thang điểm.");
      return;
    }
    setTrainings((v) => v.map((x) => (x.id === rosterTraining.id ? { ...x, ...body.training } : x)));
    setRosterTraining((t) => (t ? { ...t, ...body.training } : t));
    setMaxScoreEditing(false);
  }

  function startScoreEdit(a: Attendee) {
    setScoreEditId(a.id);
    setScoreDraft({ pre: a.pre_test_score != null ? String(a.pre_test_score) : "", post: a.post_test_score != null ? String(a.post_test_score) : "" });
  }

  async function saveScoreEdit(a: Attendee) {
    if (!rosterTraining) return;
    setRosterError("");
    const res = await fetch(`/api/procedure-trainings/${rosterTraining.id}/attendees/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pre_test_score: scoreDraft.pre.trim() === "" ? null : Number(scoreDraft.pre),
        post_test_score: scoreDraft.post.trim() === "" ? null : Number(scoreDraft.post),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRosterError(body.error || "Không lưu được điểm.");
      return;
    }
    setRosterAttendees((v) => v.map((x) => (x.id === a.id ? (body.attendee as Attendee) : x)));
    setScoreEditId(null);
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
      body: JSON.stringify({
        employee_name: newEmployeeName.trim(),
        employee_code: newEmployeeCode.trim() || null,
        pre_test_score: newPreScore.trim() === "" ? null : Number(newPreScore),
        post_test_score: newPostScore.trim() === "" ? null : Number(newPostScore),
      }),
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
    setNewPreScore("");
    setNewPostScore("");
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
          {/* Báo cáo thực tế: "A muốn cập nhật vào quản lý đào tạo" — báo cáo
              Pre/Post-test đánh giá hiệu quả đào tạo có điểm theo từng người,
              trước đây module này chỉ điểm danh có/vắng. Thang điểm bài test
              là thuộc tính của CẢ đợt đào tạo (mọi người cùng làm 1 bài test),
              nên sửa ở đây 1 lần, không lặp lại cho từng người. */}
          <div className="pt-score-max-row">
            <span className="muted">Thang điểm bài test (Pre/Post):</span>
            {maxScoreEditing ? (
              <>
                <input
                  className="input"
                  type="number"
                  min={1}
                  style={{ width: 90 }}
                  placeholder="VD: 17"
                  value={maxScoreDraft}
                  onChange={(e) => setMaxScoreDraft(e.target.value)}
                />
                <button className="button primary small" onClick={() => void saveMaxScore()}>Lưu</button>
                <button className="button tertiary small" onClick={() => setMaxScoreEditing(false)}>Hủy</button>
              </>
            ) : (
              <>
                <strong>{rosterTraining.test_score_max != null ? `/${rosterTraining.test_score_max}` : "Chưa đặt"}</strong>
                {canManage ? (
                  <button className="button tertiary small" onClick={() => setMaxScoreEditing(true)}>Sửa</button>
                ) : null}
              </>
            )}
          </div>
          {/* Báo cáo thực tế: "Thông thường khi tập huấn đào tạo, anh sẽ tạo
              gg form hoặc microsoft form để khảo sát, sau đó xuất file để
              thống kê" — nhập thẳng file khảo sát thô (mỗi cột 1 câu hỏi,
              số câu tùy file — xem src/lib/training-import.ts) hoặc file đã
              chấm sẵn (có cột Điểm), tự chấm theo đáp án khai báo bên dưới,
              tự ghép Pre/Post theo tên. Xem trước, có thể bỏ từng dòng,
              trước khi bấm lưu thật. */}
          {canManage ? (
            <div className="pt-import-wizard">
              <button type="button" className="button secondary small" onClick={() => setImportOpen((v) => !v)}>
                {importOpen ? "▴" : "▾"} Nhập từ file khảo sát (Google/Microsoft Form)
              </button>
              {importOpen ? (
                <div className="pt-import-body">
                  <label className="pt-import-field">
                    <span>Đáp án đúng (mỗi dòng 1 câu, đúng thứ tự câu hỏi trong file — để trống nếu file đã có sẵn điểm)</span>
                    <textarea className="input" rows={4} placeholder={"Câu 1: 24 giờ và 36 giờ\nCâu 2: SOAP\n..."} value={answerKeyText} onChange={(e) => setAnswerKeyText(e.target.value)} />
                  </label>
                  <button className="button tertiary small" disabled={answerKeySaving} onClick={() => void saveAnswerKey()}>
                    {answerKeySaving ? "Đang lưu..." : "Lưu đáp án"}
                  </button>

                  <div className="pt-import-upload">
                    <input
                      className="input"
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                    <label className="pt-import-default-group">
                      <span>Nếu file không có cột Nhóm, coi là:</span>
                      <select className="input" value={importDefaultGroup} onChange={(e) => setImportDefaultGroup(e.target.value as "PRE" | "POST")}>
                        <option value="PRE">Pre-test</option>
                        <option value="POST">Post-test</option>
                      </select>
                    </label>
                    <button className="button primary small" disabled={!importFile || importBusy} onClick={() => void previewImport()}>
                      {importBusy ? "Đang đọc..." : "Xem trước"}
                    </button>
                  </div>

                  {importError ? <div className="alert error">{importError}</div> : null}
                  {importResult ? <div className="alert success">{importResult}</div> : null}

                  {importMeta ? (
                    <div className="muted pt-import-meta">
                      Đọc được {importMeta.rowCount} dòng, {importMeta.questionCount || "—"} câu hỏi.
                      {!importMeta.hasGroupColumn ? ` File không có cột Nhóm — đã coi toàn bộ là ${importDefaultGroup === "POST" ? "Post-test" : "Pre-test"}.` : ""}
                      {importMeta.scoringSkippedCount > 0 ? ` Chưa tính được điểm cho ${importMeta.scoringSkippedCount} dòng vì chưa có đáp án — lưu đáp án rồi "Xem trước" lại.` : ""}
                    </div>
                  ) : null}

                  {importPreview ? (
                    <>
                      <div className="pt-import-preview">
                        {importPreview.map((a) => (
                          <label key={a.key} className={`pt-import-row ${a.included ? "" : "is-excluded"}`}>
                            <input type="checkbox" checked={a.included} onChange={() => toggleImportRow(a.key)} />
                            <span className={`status-badge ${a.type === "insert" ? "info" : "warning"}`}>{a.type === "insert" ? "Mới" : "Cập nhật"}</span>
                            <span className="pt-import-row-name">{a.employeeName}</span>
                            <small>
                              Pre: {a.preScore ?? "—"}
                              {a.type === "update" && a.preConflict ? " (ghi đè)" : ""} · Post: {a.postScore ?? "—"}
                              {a.type === "update" && a.postConflict ? " (ghi đè)" : ""}
                            </small>
                          </label>
                        ))}
                        {!importPreview.length ? <div className="empty-state compact">Không có dòng nào đọc được từ file.</div> : null}
                      </div>
                      <button className="button primary small" disabled={importCommitBusy || !importPreview.some((a) => a.included)} onClick={() => void commitImport()}>
                        {importCommitBusy ? "Đang lưu..." : `Xác nhận nhập (${importPreview.filter((a) => a.included).length} dòng)`}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {canManage ? (
            <div className="pt-roster-add-form">
              <input className="input" placeholder="Tên nhân viên..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
              <input className="input" placeholder="Mã NV (tùy chọn)" value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} />
              <input className="input" type="number" placeholder="Điểm Pre-test" value={newPreScore} onChange={(e) => setNewPreScore(e.target.value)} />
              <input className="input" type="number" placeholder="Điểm Post-test" value={newPostScore} onChange={(e) => setNewPostScore(e.target.value)} />
              <button className="button primary small" disabled={!newEmployeeName.trim()} onClick={() => void addAttendee()}>
                + Thêm
              </button>
            </div>
          ) : null}
          {rosterLoading ? (
            <div className="muted">Đang tải...</div>
          ) : (
            <div className="work-list">
              {rosterAttendees.map((a) => {
                const editingScore = scoreEditId === a.id;
                const scoreMax = rosterTraining.test_score_max;
                return (
                <div className="work-row" key={a.id}>
                  <div className="work-main">
                    <strong>
                      {a.employee_name}
                      {a.employee_code ? ` (${a.employee_code})` : ""}
                    </strong>
                    <small>{a.attended ? `Đã đào tạo${a.attended_at ? ` · ${formatDate(a.attended_at)}` : ""}` : "Chưa đào tạo"}</small>
                    {editingScore ? (
                      <div className="pt-score-edit">
                        <input className="input" type="number" placeholder="Pre" value={scoreDraft.pre} onChange={(e) => setScoreDraft((v) => ({ ...v, pre: e.target.value }))} />
                        <input className="input" type="number" placeholder="Post" value={scoreDraft.post} onChange={(e) => setScoreDraft((v) => ({ ...v, post: e.target.value }))} />
                        <button className="button primary small" onClick={() => void saveScoreEdit(a)}>Lưu</button>
                        <button className="button tertiary small" onClick={() => setScoreEditId(null)}>Hủy</button>
                      </div>
                    ) : (a.pre_test_score != null || a.post_test_score != null) ? (
                      <small>
                        Pre: {a.pre_test_score != null ? `${a.pre_test_score}${scoreMax ? `/${scoreMax}` : ""}` : "—"} · Post: {a.post_test_score != null ? `${a.post_test_score}${scoreMax ? `/${scoreMax}` : ""}` : "—"}
                      </small>
                    ) : null}
                  </div>
                  {canManage ? (
                    <>
                      <label className="inline-check">
                        <input type="checkbox" checked={a.attended} onChange={() => void toggleAttended(a)} /> Đã đào tạo
                      </label>
                      {!editingScore ? (
                        <button className="button tertiary small" onClick={() => startScoreEdit(a)}>
                          Sửa điểm
                        </button>
                      ) : null}
                      <button className="button tertiary small" onClick={() => void removeAttendee(a)}>
                        Xóa
                      </button>
                    </>
                  ) : (
                    <span className={`status-badge ${a.attended ? "success" : "warning"}`}>{a.attended ? "Đã đào tạo" : "Chưa đào tạo"}</span>
                  )}
                </div>
                );
              })}
              {!rosterAttendees.length ? <div className="empty-state compact">Chưa có nhân sự nào trong danh sách.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>, document.body,
  ) : null;

  return (
    <div className="pt-overview mobile-module-redesign">
      <div className="mobile-workflow-kpis"><div><small>Tổng quy trình</small><strong>{trainings.length}</strong></div><div><small>Đã đào tạo</small><strong>{trainings.filter((t) => t.status === "TRAINED").length}</strong></div><div><small>Chưa có kế hoạch</small><strong>{trainings.filter((t) => t.status === "NOT_PLANNED").length}</strong></div></div>
      {rosterModal}
      {/* Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối
          với kiểm soát tài liệu... nên làm menu theo dõi gồm cả 2 nội dung
          [Tự đọc hiểu + Cần đào tạo] để control" — 1 menu theo dõi, 2 tab,
          thay vì 2 trang/menu tách rời như trước. */}
      <div className="pt-view-tabs" role="group" aria-label="Hình thức phổ biến">
        <button type="button" className={view === "training" ? "active" : ""} aria-pressed={view === "training"} onClick={() => setView("training")}>
          Cần đào tạo
        </button>
        <button type="button" className={view === "self_read" ? "active" : ""} aria-pressed={view === "self_read"} onClick={() => setView("self_read")}>
          Tự đọc hiểu
        </button>
      </div>
      {view === "training" ? (
      <>
      {canManage ? (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Khai báo quy trình mới cần đào tạo</h2>
              <p>Mỗi quy trình/biểu mẫu mới ban hành là 1 dòng theo dõi đào tạo.</p>
            </div>
          </div>
          <button type="button" className="button secondary mobile-form-toggle" aria-expanded={mobileFormOpen} onClick={() => setMobileFormOpen((v) => !v)}>{mobileFormOpen ? "Thu gọn" : "+ Tạo hồ sơ đào tạo"}</button>
        <div className={mobileFormOpen ? "pt-form mobile-collapsible-form is-open" : "pt-form mobile-collapsible-form"}>
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
        <div className="mobile-workflow-filters"><input className="input" aria-label="Tìm quy trình" placeholder="Tìm tên, mã số, đơn vị soạn thảo..." value={listQuery} onChange={(e) => setListQuery(e.target.value)} /><select className="input" aria-label="Lọc trạng thái đào tạo" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="NOT_PLANNED">Chưa có kế hoạch</option><option value="PLANNED">Đã có kế hoạch</option><option value="TRAINED">Đã đào tạo</option></select></div>
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
              {trainings.filter((t) => (statusFilter === "ALL" || t.status === statusFilter) && (!listQuery.trim() || [t.procedure_name, t.procedure_code, t.drafting_unit].some((v) => String(v ?? "").toLocaleLowerCase("vi").includes(listQuery.trim().toLocaleLowerCase("vi"))))).map((t) => {
                const editing = editingId === t.id;
                return (
                  <tr key={t.id}>
                    <td>{t.procedure_code || "—"}</td>
                    <td>
                      {t.procedure_name}
                      {t.source_document ? (
                        <div><small>Từ văn bản {t.source_document.document_code || ""}{t.source_document.document_code ? " — " : ""}{t.source_document.title} · <Link className="table-link" href="/document-publications">Xem →</Link></small></div>
                      ) : null}
                    </td>
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
      </>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Tự đọc hiểu</h2>
              <p>Từng nhân viên tự bấm xác nhận đã đọc & hiểu — theo dõi ai còn chưa xác nhận để nhắc.</p>
            </div>
          </div>
          {error ? <div className="alert error">{error}</div> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã văn bản</th>
                  <th>Tên văn bản</th>
                  <th>Phiên bản</th>
                  <th>Ngày hiệu lực</th>
                  <th>Xác nhận</th>
                </tr>
              </thead>
              <tbody>
                {selfReadDocuments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.document_code || "—"}</td>
                    <td>
                      {d.title} <Link className="table-link" href="/document-publications">Xem →</Link>
                    </td>
                    <td>{d.version_label}</td>
                    <td>{formatDate(d.effective_date)}</td>
                    <td>
                      <div className="pt-ack">
                        <span className="status-badge success">{ackCount(d.id)} đã xác nhận</span>
                        {canManageDocuments ? (
                          <button type="button" className="button tertiary small" onClick={() => setUnconfirmedOpenId(unconfirmedOpenId === d.id ? null : d.id)}>
                            {unconfirmedStaff(d.id).length} chưa xác nhận {unconfirmedOpenId === d.id ? "▾" : "▸"}
                          </button>
                        ) : null}
                        {hasAcked(d.id) ? (
                          <span className="pt-ack-done">✓ Bạn đã xác nhận</span>
                        ) : (
                          <button type="button" className="button secondary small" disabled={acknowledging === d.id} onClick={() => void acknowledge(d)}>
                            {acknowledging === d.id ? "..." : "Tôi đã đọc và hiểu"}
                          </button>
                        )}
                        {unconfirmedOpenId === d.id ? (
                          <div className="pt-unconfirmed-list">
                            {unconfirmedStaff(d.id).length ? (
                              unconfirmedStaff(d.id)
                                .slice(0, 30)
                                .map((s) => (
                                  <span key={s.id} className="chip">
                                    {s.name}
                                  </span>
                                ))
                            ) : (
                              <small>Mọi người đã xác nhận.</small>
                            )}
                            {unconfirmedStaff(d.id).length > 30 ? <small>+{unconfirmedStaff(d.id).length - 30} người khác</small> : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!selfReadDocuments.length ? (
                  <tr>
                    <td colSpan={5} className="empty-state compact">
                      Chưa có văn bản nào chọn hình thức Tự đọc hiểu.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
        .pt-score-max-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pt-roster-add-form {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr auto;
          gap: 8px;
        }
        .pt-roster-add-form > * {
          min-width: 0;
        }
        .pt-score-edit {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-top: 4px;
        }
        .pt-score-edit input {
          width: 72px;
        }
        .pt-import-wizard {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 10px;
        }
        .pt-import-body {
          display: grid;
          gap: 8px;
        }
        .pt-import-field {
          display: grid;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #46545a;
        }
        .pt-import-upload {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .pt-import-upload > * {
          min-width: 0;
        }
        .pt-import-default-group {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #46545a;
          white-space: nowrap;
        }
        .pt-import-default-group select {
          width: auto;
        }
        .pt-import-meta {
          font-size: 12px;
        }
        .pt-import-preview {
          display: grid;
          gap: 6px;
          max-height: 260px;
          overflow-y: auto;
        }
        .pt-import-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 7px 9px;
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 12px;
        }
        .pt-import-row.is-excluded {
          opacity: 0.5;
        }
        .pt-import-row-name {
          font-weight: 700;
          flex: 1 1 auto;
        }
        .pt-view-tabs {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .pt-view-tabs button {
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
        .pt-view-tabs button.active {
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
        }
        .pt-ack {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pt-ack-done {
          font-size: 12px;
          color: var(--muted);
        }
        .pt-unconfirmed-list {
          flex-basis: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        @media (max-width: 900px) {
          .pt-form-row {
            grid-template-columns: 1fr;
          }
          .pt-roster-add-form {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
