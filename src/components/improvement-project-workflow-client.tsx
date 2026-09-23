"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DictationTextarea } from "@/components/dictation-textarea";

const L: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  IN_PROGRESS: "Đang PDSA",
  EVALUATED: "Đã đánh giá đạt",
  CLOSED: "Đã đóng",
};

const PHASE_LABEL: Record<string, string> = { PLAN: "Plan", DO: "Do", STUDY: "Study", ACT: "Act" };
const MILESTONE_STATUS_LABEL: Record<string, string> = { PLANNED: "Dự kiến", IN_PROGRESS: "Đang thực hiện", COMPLETED: "Hoàn thành" };

type Objective = { id: string; order: number; statement: string; indicator: string | null; baseline: string | null; target: string | null; unit: string | null; due_date: string | null };
type Milestone = { id: string; order: number; title: string; phase: string; description: string | null; start_date: string | null; end_date: string | null; status: string };

type Props = {
  recordId: string;
  status: string;
  canManage: boolean;
  objectives: number;
  milestones: number;
  actions: number;
  incomplete: number;
  evidence: number;
};

export function ImprovementProjectWorkflowClient({ recordId, status, canManage, objectives, milestones, actions, incomplete, evidence }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState("ACHIEVED");
  const [sustain, setSustain] = useState(true);
  const [scale, setScale] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupReady, setSetupReady] = useState(false);
  const [objectiveRows, setObjectiveRows] = useState<Objective[]>([]);
  const [milestoneRows, setMilestoneRows] = useState<Milestone[]>([]);
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [pendingReason, setPendingReason] = useState<{ kind: "MILESTONE_STATUS" | "OBJECTIVE_DELETE" | "MILESTONE_DELETE"; id: string; title: string; action?: "RESET" | "REOPEN" } | null>(null);
  const [pendingReasonText, setPendingReasonText] = useState("");
  const [closeNote, setCloseNote] = useState("");

  const [editingObjectiveId, setEditingObjectiveId] = useState<string | null>(null);
  const [objectiveStatement, setObjectiveStatement] = useState("");
  const [indicator, setIndicator] = useState("");
  const [baseline, setBaseline] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [objectiveDue, setObjectiveDue] = useState("");

  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [phase, setPhase] = useState("PLAN");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneStart, setMilestoneStart] = useState("");
  const [milestoneEnd, setMilestoneEnd] = useState("");

  const liveObjectives = setupReady ? objectiveRows.length : objectives;
  const liveMilestones = setupReady ? milestoneRows.length : milestones;
  const incompleteMilestones = setupReady ? milestoneRows.filter((item) => item.status !== "COMPLETED").length : liveMilestones;
  const completedMilestones = Math.max(liveMilestones - incompleteMilestones, 0);
  const milestoneEditable = ["DRAFT", "APPROVED", "IN_PROGRESS"].includes(status);

  const loadSetup = useCallback(async () => {
    if (!canManage) return;
    setSetupLoading(true);
    try {
      const response = await fetch(`/api/improvement/projects/${recordId}/setup`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không đọc được dữ liệu SMART/PDSA.");
      setObjectiveRows(Array.isArray(json.objectives) ? json.objectives : []);
      setMilestoneRows(Array.isArray(json.milestones) ? json.milestones : []);
      setProjectStart(json.start_date || "");
      setProjectEnd(json.target_end_date || "");
      setSetupReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được dữ liệu SMART/PDSA.");
    } finally {
      setSetupLoading(false);
    }
  }, [recordId, canManage]);

  useEffect(() => { void loadSetup(); }, [loadSetup]);

  async function cmd(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/improvement/projects/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không xử lý được đề án.");
      setNotice(json.message || "Đã cập nhật đề án.");
      router.refresh();
      await loadSetup();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được đề án.");
      return false;
    } finally { setBusy(false); }
  }

  async function setupCmd(action: string, payload: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/improvement/projects/${recordId}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được dữ liệu SMART/PDSA.");
      setNotice(json.message || "Đã lưu.");
      await loadSetup();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được dữ liệu SMART/PDSA.");
      return false;
    } finally { setBusy(false); }
  }

  async function executeMilestoneStatus(item: Milestone, action: "START" | "COMPLETE" | "RESET" | "REOPEN", reason = "") {
    if (busy) return false;
    if (action === "COMPLETE" && !window.confirm(`Xác nhận milestone “${item.title}” đã hoàn thành?`)) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/improvement/projects/${recordId}/milestones/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: item.id, action, reason }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không cập nhật được trạng thái milestone PDSA.");
      setNotice(json.message || "Đã cập nhật milestone PDSA.");
      if ((action === "RESET" || action === "REOPEN") && editingMilestoneId === item.id) resetMilestoneForm();
      await loadSetup();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được trạng thái milestone PDSA.");
      return false;
    } finally { setBusy(false); }
  }

  async function milestoneStatusCmd(item: Milestone, action: "START" | "COMPLETE" | "RESET" | "REOPEN") {
    if (action === "RESET" || action === "REOPEN") {
      setPendingReason({ kind: "MILESTONE_STATUS", id: item.id, title: item.title, action });
      setPendingReasonText("");
      return;
    }
    await executeMilestoneStatus(item, action);
  }

  function resetObjectiveForm() {
    setEditingObjectiveId(null);
    setObjectiveStatement(""); setIndicator(""); setBaseline(""); setTarget(""); setUnit(""); setObjectiveDue("");
  }

  function editObjective(item: Objective) {
    setEditingObjectiveId(item.id);
    setObjectiveStatement(item.statement);
    setIndicator(item.indicator || "");
    setBaseline(item.baseline || "");
    setTarget(item.target || "");
    setUnit(item.unit || "");
    setObjectiveDue(item.due_date || "");
    setError(""); setNotice("");
  }

  async function submitObjective(e: FormEvent) {
    e.preventDefault();
    const ok = await setupCmd(editingObjectiveId ? "UPDATE_OBJECTIVE" : "ADD_OBJECTIVE", {
      objective_id: editingObjectiveId || undefined,
      statement: objectiveStatement,
      indicator,
      baseline,
      target,
      unit,
      due_date: objectiveDue,
    });
    if (ok) resetObjectiveForm();
  }

  function deleteObjective(item: Objective) {
    setPendingReason({ kind: "OBJECTIVE_DELETE", id: item.id, title: `Mục tiêu SMART #${item.order}` });
    setPendingReasonText("");
  }

  function resetMilestoneForm() {
    setEditingMilestoneId(null);
    setMilestoneTitle(""); setPhase("PLAN"); setMilestoneDescription(""); setMilestoneStart(""); setMilestoneEnd("");
  }

  function editMilestone(item: Milestone) {
    setEditingMilestoneId(item.id);
    setMilestoneTitle(item.title);
    setPhase(item.phase || "PLAN");
    setMilestoneDescription(item.description || "");
    setMilestoneStart(item.start_date || "");
    setMilestoneEnd(item.end_date || "");
    setError(""); setNotice("");
  }

  async function submitMilestone(e: FormEvent) {
    e.preventDefault();
    const ok = await setupCmd(editingMilestoneId ? "UPDATE_MILESTONE" : "ADD_MILESTONE", {
      milestone_id: editingMilestoneId || undefined,
      title: milestoneTitle,
      phase,
      description: milestoneDescription,
      start_date: milestoneStart,
      end_date: milestoneEnd,
    });
    if (ok) resetMilestoneForm();
  }

  function deleteMilestone(item: Milestone) {
    setPendingReason({ kind: "MILESTONE_DELETE", id: item.id, title: item.title });
    setPendingReasonText("");
  }

  async function confirmPendingReason() {
    if (!pendingReason || !pendingReasonText.trim()) return;
    let ok = false;
    if (pendingReason.kind === "OBJECTIVE_DELETE") {
      ok = await setupCmd("DELETE_OBJECTIVE", { objective_id: pendingReason.id, reason: pendingReasonText.trim() });
      if (ok && editingObjectiveId === pendingReason.id) resetObjectiveForm();
    } else if (pendingReason.kind === "MILESTONE_DELETE") {
      ok = await setupCmd("DELETE_MILESTONE", { milestone_id: pendingReason.id, reason: pendingReasonText.trim() });
      if (ok && editingMilestoneId === pendingReason.id) resetMilestoneForm();
    } else {
      const item = milestoneRows.find((row) => row.id === pendingReason.id);
      if (item && pendingReason.action) ok = await executeMilestoneStatus(item, pendingReason.action, pendingReasonText.trim());
    }
    if (ok) {
      setPendingReason(null);
      setPendingReasonText("");
    }
  }

  function evaluate(e: FormEvent) {
    e.preventDefault();
    void cmd("EVALUATE", { objective_achievement_summary: summary, overall_result: result, sustainability_required: sustain, scaleout_recommended: scale });
  }

  const phaseSummary = useMemo(() => ["PLAN", "DO", "STUDY", "ACT"].map((key) => ({ key, count: milestoneRows.filter((item) => item.phase === key).length })), [milestoneRows]);

  return <section className="panel">
    <div style={{ padding: 18, display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>Improvement Project · SMART & PDSA</h2>
        <p style={{ color: "#64748b", fontSize: 12 }}>Baseline → mục tiêu SMART → milestone/PDSA → Action → dữ liệu trước-sau → sustain/spread.</p>
      </div>
      <strong>{L[status] || status}</strong>
    </div>

    <div style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}
      <div className="domain-metrics">
        <div><strong>{liveObjectives}</strong><span>Mục tiêu SMART</span></div>
        <div><strong>{completedMilestones}/{liveMilestones}</strong><span>Milestone hoàn thành</span></div>
        <div><strong>{actions}/{incomplete}</strong><span>Action / chưa xong</span></div>
        <div><strong>{evidence}</strong><span>Minh chứng</span></div>
      </div>

      {canManage ? <div className="alert" style={{ fontSize: 12 }}>
        <strong>Khung thời gian đề án:</strong> {projectStart || "chưa đặt"} → {projectEnd || "chưa đặt"}. Mục tiêu SMART được khóa sau khi gửi phê duyệt; milestone đã bắt đầu cũng bị khóa nội dung để giữ lịch sử PDSA. Khi cần sửa sai trạng thái, phải hoàn/mở lại có lý do và audit trail.
      </div> : null}

      {status === "DRAFT" && canManage ? <section style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>1. Mục tiêu SMART</h3>
        <form onSubmit={submitObjective} className="domain-detail-grid">
          <label className="wide">Mục tiêu cụ thể *<DictationTextarea rows={3} value={objectiveStatement} onValueChange={setObjectiveStatement} disabled={busy} placeholder="Mô tả mục tiêu cụ thể, đo lường được và có hạn hoàn thành." /></label>
          <label className="wide">Chỉ số đo lường *<input value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="Tên chỉ số / cách đo" required /></label>
          <label>Baseline *<input value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="18" required /></label>
          <label>Target *<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="8" required /></label>
          <label>Đơn vị<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, phút, ca..." /></label>
          <label>Hạn đạt *<input type="date" min={projectStart || undefined} max={projectEnd || undefined} value={objectiveDue} onChange={(e) => setObjectiveDue(e.target.value)} required /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button secondary" disabled={busy || setupLoading}>{editingObjectiveId ? "Lưu mục tiêu SMART" : "Thêm mục tiêu SMART"}</button>
            {editingObjectiveId ? <button type="button" className="button tertiary" disabled={busy} onClick={resetObjectiveForm}>Hủy sửa</button> : null}
          </div>
        </form>
      </section> : null}

      {canManage && objectiveRows.length ? <div style={{ overflowX: "auto" }}>
        <table className="data-table"><thead><tr><th>#</th><th>Mục tiêu SMART</th><th>Chỉ số</th><th>Baseline</th><th>Target</th><th>Hạn</th>{status === "DRAFT" ? <th>Thao tác</th> : null}</tr></thead><tbody>
          {objectiveRows.map((item) => <tr key={item.id}><td>{item.order}</td><td>{item.statement}</td><td>{item.indicator || "—"}</td><td>{item.baseline ?? "—"}</td><td>{item.target ?? "—"}{item.unit ? ` ${item.unit}` : ""}</td><td>{item.due_date || "—"}</td>{status === "DRAFT" ? <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button type="button" className="button tertiary small" disabled={busy} onClick={() => editObjective(item)}>Sửa</button><button type="button" className="button danger small" disabled={busy} onClick={() => void deleteObjective(item)}>Xóa</button></div></td> : null}</tr>)}
        </tbody></table>
      </div> : null}

      {canManage && milestoneEditable ? <section style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>2. Milestone / chu trình PDSA</h3>
        <form onSubmit={submitMilestone} className="domain-detail-grid">
          <label className="wide">Milestone / việc cần đạt *<input value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Ví dụ: Pilot biểu mẫu mới tại Khoa A" required /></label>
          <label>Pha PDSA *<select value={phase} onChange={(e) => setPhase(e.target.value)}><option value="PLAN">Plan</option><option value="DO">Do</option><option value="STUDY">Study</option><option value="ACT">Act</option></select></label>
          <label className="wide">Mô tả<DictationTextarea rows={2} value={milestoneDescription} onValueChange={setMilestoneDescription} disabled={busy} placeholder="Đầu ra hoặc tiêu chí hoàn thành" /></label>
          <label>Bắt đầu<input type="date" min={projectStart || undefined} max={projectEnd || undefined} value={milestoneStart} onChange={(e) => setMilestoneStart(e.target.value)} /></label>
          <label>Kết thúc<input type="date" min={projectStart || undefined} max={projectEnd || undefined} value={milestoneEnd} onChange={(e) => setMilestoneEnd(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button secondary" disabled={busy || setupLoading}>{editingMilestoneId ? "Lưu milestone/PDSA" : "Thêm milestone/PDSA"}</button>
            {editingMilestoneId ? <button type="button" className="button tertiary" disabled={busy} onClick={resetMilestoneForm}>Hủy sửa</button> : null}
          </div>
        </form>
      </section> : null}

      {canManage && milestoneRows.length ? <>
        <div className="domain-metrics">
          {phaseSummary.map((item) => <div key={item.key}><strong>{item.count}</strong><span>{PHASE_LABEL[item.key]}</span></div>)}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table"><thead><tr><th>#</th><th>PDSA</th><th>Milestone</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
            {milestoneRows.map((item) => {
              const canEdit = milestoneEditable && item.status === "PLANNED";
              const canDelete = status === "DRAFT" && item.status === "PLANNED";
              const canStart = status === "IN_PROGRESS" && item.status === "PLANNED";
              const canComplete = status === "IN_PROGRESS" && item.status === "IN_PROGRESS";
              const canReset = status === "IN_PROGRESS" && item.status === "IN_PROGRESS";
              const canReopen = status === "IN_PROGRESS" && item.status === "COMPLETED";
              const hasAction = canEdit || canDelete || canStart || canComplete || canReset || canReopen;
              return <tr key={item.id}><td>{item.order}</td><td>{PHASE_LABEL[item.phase] || item.phase}</td><td><strong>{item.title}</strong>{item.description ? <div style={{ color: "#64748b", fontSize: 12 }}>{item.description}</div> : null}</td><td>{item.start_date || "—"} → {item.end_date || "—"}</td><td>{MILESTONE_STATUS_LABEL[item.status] || item.status}</td><td>{hasAction ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {canStart ? <button type="button" className="button primary small" disabled={busy} onClick={() => void milestoneStatusCmd(item, "START")}>Bắt đầu</button> : null}
                {canComplete ? <button type="button" className="button primary small" disabled={busy} onClick={() => void milestoneStatusCmd(item, "COMPLETE")}>Hoàn thành</button> : null}
                {canReset ? <button type="button" className="button tertiary small" disabled={busy} onClick={() => void milestoneStatusCmd(item, "RESET")}>Hoàn về dự kiến</button> : null}
                {canReopen ? <button type="button" className="button tertiary small" disabled={busy} onClick={() => void milestoneStatusCmd(item, "REOPEN")}>Mở lại</button> : null}
                {canEdit ? <button type="button" className="button tertiary small" disabled={busy} onClick={() => editMilestone(item)}>Sửa</button> : null}
                {canDelete ? <button type="button" className="button danger small" disabled={busy} onClick={() => void deleteMilestone(item)}>Xóa</button> : null}
              </div> : <span className="muted">Đã khóa</span>}</td></tr>;
            })}
          </tbody></table>
        </div>
      </> : null}

      {pendingReason ? <div className="page-stack" style={{ border: "1px solid #dfe8ea", borderRadius: 12, padding: 12 }}>
        <strong>{pendingReason.kind === "MILESTONE_STATUS" ? `${pendingReason.action === "RESET" ? "Hoàn về dự kiến" : "Mở lại"} · ${pendingReason.title}` : `Xác nhận xóa · ${pendingReason.title}`}</strong>
        <label>Lý do *<DictationTextarea rows={3} value={pendingReasonText} onValueChange={setPendingReasonText} disabled={busy} placeholder="Nêu lý do để lưu audit trail." /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="button secondary" disabled={busy} onClick={() => { setPendingReason(null); setPendingReasonText(""); }}>Hủy</button><button type="button" className="button primary" disabled={busy || !pendingReasonText.trim()} onClick={() => void confirmPendingReason()}>Xác nhận</button></div>
      </div> : null}

      {status === "DRAFT" && canManage ? <button className="button primary" disabled={busy || liveObjectives < 1 || liveMilestones < 1} onClick={() => void cmd("SUBMIT")}>Gửi phê duyệt</button> : null}
      {status === "DRAFT" && canManage && (liveObjectives < 1 || liveMilestones < 1) ? <div className="alert">Cần ít nhất 01 mục tiêu SMART và 01 milestone/PDSA trước khi gửi phê duyệt.</div> : null}
      {status === "PENDING_APPROVAL" && canManage ? <button className="button primary" disabled={busy} onClick={() => void cmd("APPROVE")}>Phê duyệt đề án</button> : null}
      {status === "APPROVED" && canManage ? <button className="button primary" disabled={busy} onClick={() => void cmd("START")}>Bắt đầu triển khai PDSA</button> : null}
      {status === "IN_PROGRESS" && canManage ? <>
        {incompleteMilestones > 0 ? <div className="alert">Còn <strong>{incompleteMilestones}</strong> milestone PDSA chưa hoàn thành. Hoàn tất toàn bộ milestone trước khi đánh giá kết quả đề án.</div> : null}
        <form onSubmit={evaluate} className="domain-detail-grid">
          <label className="wide">Đánh giá mức đạt mục tiêu *<DictationTextarea rows={4} value={summary} onValueChange={setSummary} disabled={busy} /></label>
          <label>Kết quả<select value={result} onChange={(e) => setResult(e.target.value)}><option value="ACHIEVED">Đạt</option><option value="PARTIAL">Đạt một phần</option><option value="NOT_ACHIEVED">Chưa đạt</option></select></label>
          <label><input type="checkbox" checked={sustain} onChange={(e) => setSustain(e.target.checked)} /> Cần kế hoạch duy trì</label>
          <label><input type="checkbox" checked={scale} onChange={(e) => setScale(e.target.checked)} /> Đề xuất nhân rộng</label>
          <button className="button primary" disabled={busy || incompleteMilestones > 0 || actions < 1 || incomplete > 0 || evidence < 1}>Đánh giá kết quả</button>
        </form>
      </> : null}
      {status === "EVALUATED" && canManage ? <div className="page-stack"><label>Kết luận duy trì/nhân rộng *<DictationTextarea rows={3} value={closeNote} onValueChange={setCloseNote} disabled={busy} placeholder="Tóm tắt kết quả, kế hoạch duy trì và quyết định nhân rộng nếu có." /></label><button className="button primary" disabled={busy || !closeNote.trim()} onClick={() => void cmd("CLOSE", { comment: closeNote.trim() })}>Đóng đề án</button></div> : null}
    </div>
  </section>;
}