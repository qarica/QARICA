"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const L: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  IN_PROGRESS: "Đang PDSA",
  EVALUATED: "Đã đánh giá đạt",
  CLOSED: "Đã đóng",
};

const PHASE_LABEL: Record<string, string> = { PLAN: "Plan", DO: "Do", STUDY: "Study", ACT: "Act" };

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

  async function deleteObjective(item: Objective) {
    const reason = window.prompt(`Lý do xóa mục tiêu SMART #${item.order}:`);
    if (!reason?.trim()) return;
    if (!window.confirm("Xóa mục tiêu SMART nháp này? Thao tác sẽ được ghi audit trail.")) return;
    const ok = await setupCmd("DELETE_OBJECTIVE", { objective_id: item.id, reason: reason.trim() });
    if (ok && editingObjectiveId === item.id) resetObjectiveForm();
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

  async function deleteMilestone(item: Milestone) {
    const reason = window.prompt(`Lý do xóa milestone “${item.title}”:`);
    if (!reason?.trim()) return;
    if (!window.confirm("Xóa milestone PDSA nháp này? Thao tác sẽ được ghi audit trail.")) return;
    const ok = await setupCmd("DELETE_MILESTONE", { milestone_id: item.id, reason: reason.trim() });
    if (ok && editingMilestoneId === item.id) resetMilestoneForm();
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
        <div><strong>{liveMilestones}</strong><span>Milestone/PDSA</span></div>
        <div><strong>{actions}/{incomplete}</strong><span>Action / chưa xong</span></div>
        <div><strong>{evidence}</strong><span>Minh chứng</span></div>
      </div>

      {canManage ? <div className="alert" style={{ fontSize: 12 }}>
        <strong>Khung thời gian đề án:</strong> {projectStart || "chưa đặt"} → {projectEnd || "chưa đặt"}. Mục tiêu SMART được khóa sau khi gửi phê duyệt; milestone đã thực hiện cũng bị khóa để giữ lịch sử PDSA.
      </div> : null}

      {status === "DRAFT" && canManage ? <section style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>1. Mục tiêu SMART</h3>
        <form onSubmit={submitObjective} className="domain-detail-grid">
          <label className="wide">Mục tiêu cụ thể *<textarea rows={3} value={objectiveStatement} onChange={(e) => setObjectiveStatement(e.target.value)} placeholder="Ví dụ: Giảm tỷ lệ hồ sơ bàn giao trễ từ 18% xuống ≤8% trước 31/12/2026." required /></label>
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
          <label className="wide">Mô tả<textarea rows={2} value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} placeholder="Đầu ra hoặc tiêu chí hoàn thành" /></label>
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
              return <tr key={item.id}><td>{item.order}</td><td>{PHASE_LABEL[item.phase] || item.phase}</td><td><strong>{item.title}</strong>{item.description ? <div style={{ color: "#64748b", fontSize: 12 }}>{item.description}</div> : null}</td><td>{item.start_date || "—"} → {item.end_date || "—"}</td><td>{item.status}</td><td>{canEdit || canDelete ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{canEdit ? <button type="button" className="button tertiary small" disabled={busy} onClick={() => editMilestone(item)}>Sửa</button> : null}{canDelete ? <button type="button" className="button danger small" disabled={busy} onClick={() => void deleteMilestone(item)}>Xóa</button> : null}</div> : <span className="muted">Đã khóa</span>}</td></tr>;
            })}
          </tbody></table>
        </div>
      </> : null}

      {status === "DRAFT" && canManage ? <button className="button primary" disabled={busy || liveObjectives < 1 || liveMilestones < 1} onClick={() => void cmd("SUBMIT")}>Gửi phê duyệt</button> : null}
      {status === "DRAFT" && canManage && (liveObjectives < 1 || liveMilestones < 1) ? <div className="alert">Cần ít nhất 01 mục tiêu SMART và 01 milestone/PDSA trước khi gửi phê duyệt.</div> : null}
      {status === "PENDING_APPROVAL" && canManage ? <button className="button primary" disabled={busy} onClick={() => void cmd("APPROVE")}>Phê duyệt đề án</button> : null}
      {status === "APPROVED" && canManage ? <button className="button primary" disabled={busy} onClick={() => void cmd("START")}>Bắt đầu triển khai PDSA</button> : null}
      {status === "IN_PROGRESS" && canManage ? <form onSubmit={evaluate} className="domain-detail-grid">
        <label className="wide">Đánh giá mức đạt mục tiêu *<textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} required /></label>
        <label>Kết quả<select value={result} onChange={(e) => setResult(e.target.value)}><option value="ACHIEVED">Đạt</option><option value="PARTIAL">Đạt một phần</option><option value="NOT_ACHIEVED">Chưa đạt</option></select></label>
        <label><input type="checkbox" checked={sustain} onChange={(e) => setSustain(e.target.checked)} /> Cần kế hoạch duy trì</label>
        <label><input type="checkbox" checked={scale} onChange={(e) => setScale(e.target.checked)} /> Đề xuất nhân rộng</label>
        <button className="button primary" disabled={busy || actions < 1 || incomplete > 0 || evidence < 1}>Đánh giá kết quả</button>
      </form> : null}
      {status === "EVALUATED" && canManage ? <button className="button primary" disabled={busy} onClick={() => { const x = window.prompt("Kết luận duy trì/nhân rộng:"); if (x?.trim()) void cmd("CLOSE", { comment: x.trim() }); }}>Đóng đề án</button> : null}
    </div>
  </section>;
}
