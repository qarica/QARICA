"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Level = { id: string; label: string };
type Criterion = { id: string; code: string; name: string; required: boolean; levels: Level[]; levelId: string; comment: string; status: string };

export function AssessmentCriteriaClient({ recordId, editable, criteria }: { recordId: string; editable: boolean; criteria: Criterion[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(criteria);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function change(id: string, patch: Partial<Criterion>) { setRows((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  async function save(row: Criterion, action: "SAVE_DRAFT" | "SUBMIT") {
    if (!row.levelId) { setError("Vui lòng chọn mức đánh giá trước khi lưu."); return; }
    setBusyId(row.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/assessments/${recordId}/criteria`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, criterion_id: row.id, proposed_level_id: row.levelId, summary_comment: row.comment }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được tiêu chí.");
      change(row.id, { status: json.status }); setMessage(json.message); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được tiêu chí."); }
    finally { setBusyId(""); }
  }

  return <section className="panel">
    <div className="panel-title"><div><h2>Phiếu tự đánh giá từng tiêu chí</h2><p>Chọn mức đạt, ghi nhận xét và gửi từng tiêu chí. Có thể lưu nháp trước khi gửi.</p></div><strong>{rows.filter((x) => x.status === "SUBMITTED").length}/{rows.length} đã gửi</strong></div>
    <div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
      {error ? <div className="alert error">{error}</div> : null}{message ? <div className="alert success">{message}</div> : null}
      {rows.length === 0 ? <div className="empty-state">Đợt này chưa có tiêu chí trong phạm vi.</div> : rows.map((row) => <article key={row.id} className="operating-spec-card" style={{ display: "grid", gap: 10 }}>
        <div><strong>{row.code} · {row.name}</strong>{row.required ? <span> · Bắt buộc</span> : null}</div>
        <div className="detail-grid">
          <label><span>Mức tự đánh giá *</span><select disabled={!editable || busyId === row.id} value={row.levelId} onChange={(e) => change(row.id, { levelId: e.target.value })}><option value="">Chọn mức...</option>{row.levels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
          <label className="wide"><span>Nhận xét / giải trình</span><textarea disabled={!editable || busyId === row.id} rows={2} value={row.comment} onChange={(e) => change(row.id, { comment: e.target.value })} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span>Trạng thái: <strong>{row.status || "NOT_STARTED"}</strong></span>{editable ? <><button className="button secondary small" disabled={busyId === row.id || !row.levelId} onClick={() => save(row, "SAVE_DRAFT")}>Lưu nháp</button><button className="button primary small" disabled={busyId === row.id || !row.levelId} onClick={() => save(row, "SUBMIT")}>Gửi tiêu chí</button></> : null}</div>
      </article>)}
    </div>
  </section>;
}
