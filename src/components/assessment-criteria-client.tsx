"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Criterion = {
  id: string;
  code: string;
  name: string;
  required: boolean;
  scoreValue: string;
  note: string;
  status: string;
  ownerLabel?: string | null;
  sourceTargetText?: string | null;
  dueDate?: string | null;
  priority?: boolean;
};

const SCORE_OPTIONS = [
  { value: "", label: "— Chưa chấm —" },
  { value: "1", label: "Mức 1" },
  { value: "2", label: "Mức 2" },
  { value: "3", label: "Mức 3" },
  { value: "4", label: "Mức 4" },
  { value: "5", label: "Mức 5" },
  { value: "NA", label: "Không đánh giá" },
];

export function AssessmentCriteriaClient({
  recordId,
  editable,
  criteria,
  routingNote,
}: {
  recordId: string;
  editable: boolean;
  criteria: Criterion[];
  routingNote?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(criteria);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function change(id: string, patch: Partial<Criterion>) {
    setRows((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(row: Criterion, action: "SAVE_DRAFT" | "SUBMIT") {
    if (!row.scoreValue) {
      setError("Vui lòng chọn mức đánh giá hoặc “Không đánh giá” trước khi lưu.");
      return;
    }
    if (row.scoreValue === "NA" && !row.note.trim()) {
      setError("Khi chọn “Không đánh giá”, cần ghi rõ lý do.");
      return;
    }

    setBusyId(row.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/assessments/${recordId}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          criteria_item_id: row.id,
          score: row.scoreValue === "NA" ? null : Number(row.scoreValue),
          not_evaluated: row.scoreValue === "NA",
          note: row.note.trim() || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được tiêu chí.");
      change(row.id, { status: json.status });
      setMessage(json.message || "Đã lưu tiêu chí.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được tiêu chí.");
    } finally {
      setBusyId("");
    }
  }

  const submitted = rows.filter((row) => ["SUBMITTED", "REVIEWED", "FINALIZED", "COMPLETED", "APPROVED"].includes(row.status)).length;

  return <section className="panel assessment-criteria-runtime">
    <style>{`
      .assessment-criteria-runtime .acr-list{display:grid;gap:10px;padding:0 16px 16px}.assessment-criteria-runtime .acr-row{display:grid;grid-template-columns:minmax(0,1.6fr) 170px minmax(220px,1fr) auto;gap:10px;align-items:end;border:1px solid #e2e8f0;border-radius:13px;padding:11px 12px;background:#fff}.assessment-criteria-runtime .acr-row.priority{border-left:4px solid #d89a21}.assessment-criteria-runtime .acr-title strong{font-size:11.5px;color:#263b50}.assessment-criteria-runtime .acr-title small{display:block;margin-top:3px;font-size:9.5px;color:#73818c;line-height:1.45}.assessment-criteria-runtime .acr-field{display:grid;gap:5px}.assessment-criteria-runtime .acr-field>span{font-size:9px;font-weight:850;color:#64748b;text-transform:uppercase}.assessment-criteria-runtime .acr-actions{display:flex;gap:6px;flex-wrap:wrap}.assessment-criteria-runtime .acr-status{font-size:9px;font-weight:850;color:#53687a}.assessment-criteria-runtime .acr-route-note{margin:0 16px 12px;padding:9px 11px;border-radius:10px;background:#f7fafc;color:#61717f;font-size:10px;line-height:1.45}
      @media(max-width:900px){.assessment-criteria-runtime .acr-row{grid-template-columns:1fr 1fr}.assessment-criteria-runtime .acr-title{grid-column:1/-1}}@media(max-width:620px){.assessment-criteria-runtime .acr-row{grid-template-columns:1fr}.assessment-criteria-runtime .acr-title{grid-column:auto}.assessment-criteria-runtime .acr-actions .button{flex:1}}
    `}</style>
    <div className="panel-title">
      <div>
        <h2>Phiếu tự đánh giá từng tiêu chí</h2>
        <p>Chấm trực tiếp Mức 1–5 theo bộ tiêu chí đã phát hành. Mỗi tiêu chí lưu riêng; QARICA ghi người thao tác và lịch sử thay đổi.</p>
      </div>
      <strong>{submitted}/{rows.length} đã gửi</strong>
    </div>
    {routingNote ? <div className="acr-route-note">{routingNote}</div> : null}
    <div className="acr-list">
      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}
      {rows.length === 0 ? <div className="empty-state"><strong>Chưa có tiêu chí được giao cho phạm vi hiện tại.</strong><p>QLCL cần xác nhận phân công 83 tiêu chí trước; hệ thống không tự gán mơ hồ.</p></div> : rows.map((row) => <article key={row.id} className={`acr-row ${row.priority ? "priority" : ""}`}>
        <div className="acr-title">
          <strong>{row.code} · {row.name}</strong>
          <small>
            {row.ownerLabel ? `Nguồn phụ trách: ${row.ownerLabel}` : "Chưa có phân công nguồn"}
            {row.sourceTargetText ? ` · Mục tiêu: ${row.sourceTargetText}` : ""}
            {row.dueDate ? ` · Hạn: ${row.dueDate.split("-").reverse().join("/")}` : ""}
          </small>
        </div>
        <label className="acr-field"><span>Mức tự đánh giá *</span><select disabled={!editable || busyId === row.id} value={row.scoreValue} onChange={(event) => change(row.id, { scoreValue: event.target.value })}>{SCORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="acr-field"><span>Nhận xét / minh chứng</span><input disabled={!editable || busyId === row.id} value={row.note} onChange={(event) => change(row.id, { note: event.target.value })} placeholder="Nêu ngắn gọn bằng chứng hoặc lý do..." /></label>
        <div className="acr-actions">
          <span className="acr-status">{row.status || "NOT_STARTED"}</span>
          {editable ? <><button className="button secondary small" disabled={busyId === row.id || !row.scoreValue} onClick={() => save(row, "SAVE_DRAFT")}>Lưu nháp</button><button className="button primary small" disabled={busyId === row.id || !row.scoreValue} onClick={() => save(row, "SUBMIT")}>Gửi</button></> : null}
        </div>
      </article>)}
    </div>
  </section>;
}
