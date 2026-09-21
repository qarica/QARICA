"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Level = { id: string; label: string };
type Criterion = { id: string; code: string; name: string; required: boolean; applicability: string; notApplicableReason: string; leadDepartmentId: string|null; score: number|null; result: string; levels: Level[]; levelId: string; comment: string; status: string };
const STATUS:Record<string,string>={NOT_STARTED:"Chưa thực hiện",DRAFT:"Đang làm",SUBMITTED:"Đã gửi",REVIEWED:"Đã rà soát",FINALIZED:"Đã chốt",COMPLETED:"Hoàn tất",APPROVED:"Đã duyệt"};

export function AssessmentCriteriaClient({ recordId, editable, criteria }: { recordId: string; editable: boolean; criteria: Criterion[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(criteria);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function change(id: string, patch: Partial<Criterion>) { setRows((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  async function save(row: Criterion, action: "SAVE_DRAFT" | "SUBMIT") {
    if (row.applicability === "NOT_APPLICABLE") { setError("Tiêu chí Không áp dụng không cần chấm."); return; }\n    if (row.score == null && !row.result.trim()) { setError("Vui lòng nhập điểm hoặc kết quả đánh giá."); return; }
    setBusyId(row.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/assessments/${recordId}/criteria`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, criterion_id: row.id, score: row.score, result: row.result, summary_comment: row.comment }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được tiêu chí.");
      change(row.id, { status: json.status }); setMessage(json.message); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được tiêu chí."); }
    finally { setBusyId(""); }
  }

  return <section className="panel">
    <div className="panel-title"><div><h2>Bảng tự đánh giá</h2><p>Nhập kết quả trực tiếp theo từng tiêu chí. Tiêu chí Không áp dụng được giữ trong bộ nhưng không tính vào tiến độ chấm.</p></div><strong>{rows.filter((x) => x.status === "SUBMITTED").length}/{rows.filter((x)=>x.applicability !== "NOT_APPLICABLE").length} đã gửi</strong></div>
    <div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
      {error ? <div className="alert error">{error}</div> : null}{message ? <div className="alert success">{message}</div> : null}
      {rows.length === 0 ? <div className="empty-state">Đợt này chưa có tiêu chí trong phạm vi.</div> : rows.map((row) => <article key={row.id} className="operating-spec-card" style={{ display: "grid", gap: 10 }}>
        <div><strong>{row.code} · {row.name}</strong>{row.required ? <span> · Bắt buộc</span> : null}</div>
        <div className="detail-grid">
          <label><span>Mức tự đánh giá *</span><select disabled={!editable || busyId === row.id} value={row.levelId} onChange={(e) => change(row.id, { levelId: e.target.value })}><option value="">Chọn mức...</option>{row.levels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
          <label className="wide"><span>Nhận xét / giải trình</span><textarea disabled={!editable || busyId === row.id} rows={2} value={row.comment} onChange={(e) => change(row.id, { comment: e.target.value })} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span>Trạng thái: <strong>{STATUS[row.status] || row.status || "Chưa thực hiện"}</strong></span>{editable ? <><button className="button secondary small" disabled={busyId === row.id || row.applicability === "NOT_APPLICABLE" || (row.score == null && !row.result.trim())} onClick={() => save(row, "SAVE_DRAFT")}>Lưu để làm tiếp</button><button className="button primary small" disabled={busyId === row.id || row.applicability === "NOT_APPLICABLE" || (row.score == null && !row.result.trim())} onClick={() => save(row, "SUBMIT")}>Hoàn tất & gửi</button></> : null}</div>
      </article>)}
    </div>
  </section>;
}
