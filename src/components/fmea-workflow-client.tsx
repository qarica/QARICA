"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const LABELS: Record<string, string> = { DRAFT: "Nháp", PENDING_APPROVAL: "Chờ phê duyệt", IN_PROGRESS: "Đang can thiệp", RESIDUAL_REVIEW: "Re-score residual risk", CLOSED: "Đã đóng" };
type StepRow = { id: string; order: number; label: string; description: string | null };
type ModeRow = { id: string; process_step_id: string; order: number; label: string; effect: string | null; cause: string | null; control: string | null; severity: number | null; occurrence: number | null; detection: number | null; rpn: number | null; is_high_priority: boolean };
type Props = { recordId: string; status: string; canManage: boolean; hasModel: boolean; steps: number; modes: number; highPriority: number; actions: number; incomplete: number; evidence: number };

const emptyStep = { label: "", description: "" };
const emptyMode = { process_step_id: "", label: "", effect: "", cause: "", control: "", severity: "", occurrence: "", detection: "", is_high_priority: false };

export function FmeaWorkflowClient({ recordId, status, canManage, hasModel, steps, modes, highPriority, actions, incomplete, evidence }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [setupBusy, setSetupBusy] = useState(false), [setupError, setSetupError] = useState("");
  const [stepRows, setStepRows] = useState<StepRow[]>([]), [modeRows, setModeRows] = useState<ModeRow[]>([]);
  const [stepForm, setStepForm] = useState(emptyStep), [modeForm, setModeForm] = useState(emptyMode);
  const [editingStepId, setEditingStepId] = useState<string | null>(null), [editingModeId, setEditingModeId] = useState<string | null>(null);
  const editable = canManage && ["DRAFT", "IN_PROGRESS"].includes(status);
  const deletable = canManage && status === "DRAFT";
  const stepMap = useMemo(() => new Map(stepRows.map((step) => [step.id, step.label])), [stepRows]);
  const previewRpn = useMemo(() => { const s = Number(modeForm.severity), o = Number(modeForm.occurrence), d = Number(modeForm.detection); return [s, o, d].every((value) => Number.isInteger(value) && value >= 1 && value <= 10) ? s * o * d : null; }, [modeForm.severity, modeForm.occurrence, modeForm.detection]);

  async function loadSetup() {
    if (!canManage) return;
    setSetupError("");
    const response = await fetch(`/api/fmea/${recordId}/setup`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Không tải được dữ liệu phân tích FMEA.");
    setStepRows(Array.isArray(json.steps) ? json.steps : []);
    setModeRows(Array.isArray(json.modes) ? json.modes : []);
  }

  useEffect(() => { if (!canManage) return; loadSetup().catch((cause) => setSetupError(cause instanceof Error ? cause.message : "Không tải được dữ liệu FMEA.")); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [recordId, canManage]);

  async function command(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch(`/api/fmea/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) }); const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || "Không xử lý được FMEA."); setNotice(json.message || "Đã cập nhật FMEA."); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không xử lý được FMEA."); }
    finally { setBusy(false); }
  }

  async function setupCommand(action: string, payload: Record<string, unknown>) {
    setSetupBusy(true); setSetupError(""); setNotice("");
    try { const response = await fetch(`/api/fmea/${recordId}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) }); const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || "Không lưu được phân tích FMEA."); setNotice(json.message || "Đã lưu phân tích FMEA."); await loadSetup(); router.refresh(); return true; }
    catch (cause) { setSetupError(cause instanceof Error ? cause.message : "Không lưu được phân tích FMEA."); return false; }
    finally { setSetupBusy(false); }
  }

  async function saveStep(event: React.FormEvent) {
    event.preventDefault();
    const ok = await setupCommand(editingStepId ? "UPDATE_STEP" : "ADD_STEP", editingStepId ? { ...stepForm, step_id: editingStepId } : stepForm);
    if (ok) { setEditingStepId(null); setStepForm(emptyStep); }
  }
  function beginStepEdit(step: StepRow) { setEditingStepId(step.id); setStepForm({ label: step.label, description: step.description || "" }); }
  async function deleteStep(step: StepRow) { const reason = window.prompt(`Lý do xóa bước “${step.label}”:`); if (!reason?.trim()) return; const ok = await setupCommand("DELETE_STEP", { step_id: step.id, reason: reason.trim() }); if (ok && editingStepId === step.id) { setEditingStepId(null); setStepForm(emptyStep); } }

  async function saveMode(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...modeForm, severity: Number(modeForm.severity), occurrence: Number(modeForm.occurrence), detection: Number(modeForm.detection) };
    const ok = await setupCommand(editingModeId ? "UPDATE_MODE" : "ADD_MODE", editingModeId ? { ...payload, mode_id: editingModeId } : payload);
    if (ok) { const selected = modeForm.process_step_id; setEditingModeId(null); setModeForm({ ...emptyMode, process_step_id: selected }); }
  }
  function beginModeEdit(mode: ModeRow) { setEditingModeId(mode.id); setModeForm({ process_step_id: mode.process_step_id, label: mode.label, effect: mode.effect || "", cause: mode.cause || "", control: mode.control || "", severity: mode.severity == null ? "" : String(mode.severity), occurrence: mode.occurrence == null ? "" : String(mode.occurrence), detection: mode.detection == null ? "" : String(mode.detection), is_high_priority: mode.is_high_priority }); }
  async function deleteMode(mode: ModeRow) { const reason = window.prompt(`Lý do xóa failure mode “${mode.label}”:`); if (!reason?.trim()) return; const ok = await setupCommand("DELETE_MODE", { mode_id: mode.id, reason: reason.trim() }); if (ok && editingModeId === mode.id) { setEditingModeId(null); setModeForm(emptyMode); } }

  return <section className="panel fmea-workflow-panel">
    <style>{`.fmea-row-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.fmea-edit-note{font-size:11px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:8px 10px}.fmea-form-actions{display:flex;gap:8px;flex-wrap:wrap}`}</style>
    <div className="panel-title"><div><h2>FMEA/HFMEA Workflow</h2><p>Quy trình → failure mode → ưu tiên → Action → re-score → residual risk.</p></div><strong>{LABELS[status] || status}</strong></div>
    <div style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
      {error ? <div className="alert error">{error}</div> : null}{setupError ? <div className="alert error">{setupError}</div> : null}{notice ? <div className="alert success">{notice}</div> : null}
      <div className="domain-metrics"><div><strong>{hasModel ? "Có" : "Thiếu"}</strong><span>Mô hình điểm</span></div><div><strong>{steps}</strong><span>Bước quy trình</span></div><div><strong>{modes}</strong><span>Failure mode</span></div><div><strong>{highPriority}</strong><span>Ưu tiên cao</span></div><div><strong>{actions}/{incomplete}</strong><span>Action/chưa xong</span></div><div><strong>{evidence}</strong><span>Minh chứng</span></div></div>

      {canManage ? <div style={{ display: "grid", gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}><div><strong>Bước 1 · Lập sơ đồ quy trình</strong><div className="muted">Nhập lần lượt các bước cần phân tích.</div></div><span className="muted">{stepRows.length} bước</span></div>
          {editable ? <form onSubmit={saveStep} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {editingStepId ? <div className="fmea-edit-note">Đang sửa bước quy trình. Thay đổi sẽ được ghi audit trail; xóa chỉ khả dụng khi FMEA còn DRAFT.</div> : null}
            <label>Tên bước quy trình<input className="input" value={stepForm.label} onChange={(event) => setStepForm((value) => ({ ...value, label: event.target.value }))} placeholder="Ví dụ: Tiếp nhận và xác nhận người bệnh" required /></label>
            <label>Mô tả / điểm kiểm soát<textarea className="input" rows={2} value={stepForm.description} onChange={(event) => setStepForm((value) => ({ ...value, description: event.target.value }))} placeholder="Mô tả ngắn hoạt động trong bước này" /></label>
            <div className="fmea-form-actions"><button className="button secondary" disabled={setupBusy}>{editingStepId ? "Lưu sửa bước" : "+ Thêm bước quy trình"}</button>{editingStepId ? <button type="button" className="button tertiary" disabled={setupBusy} onClick={() => { setEditingStepId(null); setStepForm(emptyStep); }}>Hủy sửa</button> : null}</div>
          </form> : null}
          <div style={{ display: "grid", gap: 8 }}>{stepRows.length ? stepRows.map((step) => <div key={step.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}><strong>{step.order}. {step.label}</strong>{step.description ? <div className="muted">{step.description}</div> : null}{editable ? <div className="fmea-row-actions"><button type="button" className="button tertiary small" disabled={setupBusy} onClick={() => beginStepEdit(step)}>Sửa</button>{deletable ? <button type="button" className="button tertiary small" disabled={setupBusy} onClick={() => deleteStep(step)}>Xóa</button> : null}</div> : null}</div>) : <div className="muted">Chưa có bước quy trình. FMEA chưa thể gửi phê duyệt.</div>}</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}><div><strong>Bước 2 · Phân tích failure mode</strong><div className="muted">Gắn failure mode vào từng bước và chấm Severity / Occurrence / Detection.</div></div><span className="muted">{modeRows.length} failure mode</span></div>
          {editable && stepRows.length ? <form onSubmit={saveMode} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {editingModeId ? <div className="fmea-edit-note">Đang sửa failure mode. RPN sẽ được tính lại từ S × O × D. Sau khi FMEA chuyển khỏi IN_PROGRESS, dữ liệu nền bị khóa.</div> : null}
            <label>Bước quy trình<select className="input" value={modeForm.process_step_id} onChange={(event) => setModeForm((value) => ({ ...value, process_step_id: event.target.value }))} required><option value="">Chọn bước</option>{stepRows.map((step) => <option key={step.id} value={step.id}>{step.order}. {step.label}</option>)}</select></label>
            <label>Failure mode<input className="input" value={modeForm.label} onChange={(event) => setModeForm((value) => ({ ...value, label: event.target.value }))} placeholder="Điều gì có thể sai?" required /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}><label>Hậu quả<input className="input" value={modeForm.effect} onChange={(event) => setModeForm((value) => ({ ...value, effect: event.target.value }))} /></label><label>Nguyên nhân<input className="input" value={modeForm.cause} onChange={(event) => setModeForm((value) => ({ ...value, cause: event.target.value }))} /></label><label>Kiểm soát hiện tại<input className="input" value={modeForm.control} onChange={(event) => setModeForm((value) => ({ ...value, control: event.target.value }))} /></label></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}><label>Severity (1–10)<input className="input" type="number" min="1" max="10" step="1" value={modeForm.severity} onChange={(event) => setModeForm((value) => ({ ...value, severity: event.target.value }))} required /></label><label>Occurrence (1–10)<input className="input" type="number" min="1" max="10" step="1" value={modeForm.occurrence} onChange={(event) => setModeForm((value) => ({ ...value, occurrence: event.target.value }))} required /></label><label>Detection (1–10)<input className="input" type="number" min="1" max="10" step="1" value={modeForm.detection} onChange={(event) => setModeForm((value) => ({ ...value, detection: event.target.value }))} required /></label><div><span className="muted">RPN dự kiến</span><div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{previewRpn ?? "—"}</div></div></div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={modeForm.is_high_priority} onChange={(event) => setModeForm((value) => ({ ...value, is_high_priority: event.target.checked }))} /> Đánh dấu failure mode ưu tiên cao</label>
            <div className="fmea-form-actions"><button className="button secondary" disabled={setupBusy}>{editingModeId ? "Lưu sửa failure mode" : "+ Thêm failure mode"}</button>{editingModeId ? <button type="button" className="button tertiary" disabled={setupBusy} onClick={() => { setEditingModeId(null); setModeForm(emptyMode); }}>Hủy sửa</button> : null}</div>
          </form> : editable ? <div className="alert">Cần thêm ít nhất một bước quy trình trước khi nhập failure mode.</div> : null}

          <div style={{ overflowX: "auto" }}>{modeRows.length ? <table className="table"><thead><tr><th>Bước</th><th>Failure mode</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>Ưu tiên</th>{editable ? <th>Thao tác</th> : null}</tr></thead><tbody>{modeRows.map((mode) => <tr key={mode.id}><td>{stepMap.get(mode.process_step_id) || "—"}</td><td><strong>{mode.label}</strong>{mode.effect ? <div className="muted">Hậu quả: {mode.effect}</div> : null}{mode.cause ? <div className="muted">Nguyên nhân: {mode.cause}</div> : null}{mode.control ? <div className="muted">Kiểm soát: {mode.control}</div> : null}</td><td>{mode.severity ?? "—"}</td><td>{mode.occurrence ?? "—"}</td><td>{mode.detection ?? "—"}</td><td><strong>{mode.rpn ?? "—"}</strong></td><td>{mode.is_high_priority ? "Cao" : "—"}</td>{editable ? <td><div className="fmea-row-actions"><button type="button" className="button tertiary small" disabled={setupBusy} onClick={() => beginModeEdit(mode)}>Sửa</button>{deletable ? <button type="button" className="button tertiary small" disabled={setupBusy} onClick={() => deleteMode(mode)}>Xóa</button> : null}</div></td> : null}</tr>)}</tbody></table> : <div className="muted">Chưa có failure mode. FMEA chưa thể gửi phê duyệt.</div>}</div>
        </div>
      </div> : null}

      {status === "DRAFT" && canManage ? <button className="button primary" disabled={busy || !hasModel || steps < 1 || modes < 1} onClick={() => command("SUBMIT")}>Gửi phê duyệt FMEA</button> : null}
      {status === "PENDING_APPROVAL" && canManage ? <button className="button primary" disabled={busy} onClick={() => command("APPROVE")}>Phê duyệt triển khai</button> : null}
      {status === "IN_PROGRESS" && canManage ? <button className="button primary" disabled={busy || (highPriority > 0 && actions < 1) || incomplete > 0 || evidence < 1} onClick={() => command("REQUEST_RESIDUAL_REVIEW")}>Chuyển re-score residual risk</button> : null}
      {status === "RESIDUAL_REVIEW" && canManage ? <button className="button primary" disabled={busy} onClick={() => { const conclusion = window.prompt("Kết luận re-score và chấp nhận residual risk:"); if (conclusion?.trim()) command("CLOSE", { comment: conclusion.trim() }); }}>Chấp nhận residual risk & đóng</button> : null}
    </div>
  </section>;
}
