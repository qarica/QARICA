"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DictationTextarea } from "@/components/dictation-textarea";

export function FindingWorkflowClient({ recordId, status, canOperate, canManage, actionCount, incompleteActionCount, evidenceCount }: { recordId: string; status: string; canOperate: boolean; canManage: boolean; actionCount: number; incompleteActionCount: number; evidenceCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"RETURN"|"ACCEPT"|"ESCALATE_CAPA"|null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");

  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/findings/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không cập nhật được Finding.");
      setMode(null); setComment(""); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Không cập nhật được Finding."); }
    finally { setBusy(false); }
  }

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    void run(mode, { ...data, comment: comment.trim() });
  }

  const canSubmit = canOperate && ["IN_PROGRESS", "RETURNED", "ASSIGNED", "OPEN"].includes(status);
  return <section className="panel finding-workflow-panel">
    <style>{`.finding-workflow-panel{padding:16px}.finding-workflow-panel .fw-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.finding-workflow-panel h2{font-size:18px;margin:0}.finding-workflow-panel p{margin:4px 0 0;color:#68797f;font-size:12px}.finding-workflow-panel .fw-actions{display:flex;gap:8px;flex-wrap:wrap}.finding-workflow-panel .fw-checks{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.finding-workflow-panel .fw-chip{font-size:11px;padding:5px 9px;border-radius:999px;background:#f1f6f6;font-weight:750}.finding-workflow-panel .fw-chip.bad{background:#fff1ef;color:#a13c2e}.finding-workflow-panel .fw-error{margin-top:10px}.finding-workflow-panel .fw-modal{margin-top:14px;padding:14px;border:1px solid #dce7e9;border-radius:13px;background:#f8fbfb}.finding-workflow-panel .fw-modal textarea{width:100%;min-height:90px;border:1px solid #cddadd;border-radius:10px;padding:10px;font:inherit}.finding-workflow-panel .fw-modal .form-grid{margin-top:10px}.finding-workflow-panel .fw-modal-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}@media(max-width:640px){.finding-workflow-panel .fw-actions{width:100%}.finding-workflow-panel .fw-actions .button{flex:1;justify-content:center}.finding-workflow-panel .fw-modal-buttons .button{flex:1}}`}</style>
    <div className="fw-head"><div><h2>Luồng xử lý Finding</h2><p>Finding → Action → Evidence → Recheck/Xác minh → Đóng hoặc chuyển CAPA.</p></div><div className="fw-actions">
      {canOperate && ["OPEN","ASSIGNED"].includes(status) ? <button className="button secondary" disabled={busy} onClick={() => run("START")}>Bắt đầu xử lý</button> : null}
      {canSubmit ? <button className="button" disabled={busy || actionCount===0 || incompleteActionCount>0 || evidenceCount===0} onClick={() => run("SUBMIT")}>Gửi xác minh</button> : null}
      {canManage && status === "EVIDENCE_SUBMITTED" ? <button className="button" disabled={busy} onClick={() => run("BEGIN_VERIFY")}>Bắt đầu xác minh</button> : null}
      {canManage && status === "VERIFYING" ? <><button className="button success" disabled={busy} onClick={() => { setComment(""); setMode("ACCEPT"); }}>Chấp nhận & đóng</button><button className="button secondary" disabled={busy} onClick={() => { setComment(""); setMode("RETURN"); }}>Trả lại</button><button className="button secondary" disabled={busy} onClick={() => { setComment(""); setMode("ESCALATE_CAPA"); }}>Chuyển CAPA</button></> : null}
    </div></div>
    <div className="fw-checks"><span className={`fw-chip ${actionCount===0?"bad":""}`}>{actionCount} Action</span><span className={`fw-chip ${incompleteActionCount>0?"bad":""}`}>{incompleteActionCount} Action chưa hoàn thành</span><span className={`fw-chip ${evidenceCount===0?"bad":""}`}>{evidenceCount} minh chứng</span></div>
    {error ? <div className="alert error fw-error">{error}</div> : null}
    {mode ? <form className="fw-modal" onSubmit={submitReview}><strong>{mode === "ACCEPT" ? "Xác nhận kết quả khắc phục" : mode === "RETURN" ? "Trả lại để bổ sung" : "Chuyển Finding thành CAPA"}</strong><div className="form-grid two">
      <label className="span-2">Nhận xét *<DictationTextarea rows={3} value={comment} onValueChange={setComment} disabled={busy} placeholder="Ghi rõ căn cứ xác minh/quyết định" /></label>
      {mode === "RETURN" ? <label>Hạn bổ sung tiếp theo<input name="next_due_date" type="date" required /></label> : null}
      {mode === "ESCALATE_CAPA" ? <label>Mức ưu tiên CAPA<select name="capa_priority" defaultValue="HIGH"><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn</option><option value="CRITICAL">Rất khẩn / trọng yếu</option></select></label> : null}
    </div><div className="fw-modal-buttons"><button className="button tertiary" type="button" onClick={() => { setMode(null); setComment(""); }}>Đóng</button><button className="button" disabled={busy || !comment.trim()} type="submit">{busy?"Đang lưu…":"Xác nhận"}</button></div></form> : null}
  </section>;
}
