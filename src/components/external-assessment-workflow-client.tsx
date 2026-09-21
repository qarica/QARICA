"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type SelfOption = { id: string; label: string };
type Gap = { id: string; criterionRef: string; selfScore: string; externalScore: string; status: string; href: string };

export function ExternalAssessmentWorkflowClient({ recordId, lifecycleStatus, canManage, canReview, selfOptions, linkedSelf, gaps, evidence }: { recordId: string; lifecycleStatus: string; canManage: boolean; canReview: boolean; selfOptions: SelfOption[]; linkedSelf: SelfOption | null; gaps: Gap[]; evidence: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selfId, setSelfId] = useState(linkedSelf?.id || "");
  const [form, setForm] = useState({ criterion_ref: "", self_score: "", external_score: "", description: "", severity: "MAJOR", due_date: "" });
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/external-assessments/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không xử lý được đánh giá ngoài.");
      setNotice(result.message); router.refresh();
    } catch (value) { setError(value instanceof Error ? value.message : "Không xử lý được đánh giá ngoài."); } finally { setBusy(false); }
  }
  const open = gaps.filter((x) => !["CLOSED", "CANCELLED"].includes(x.status)).length;
  return <section className="panel"><div className="panel-title"><div><h2>Đối chiếu Self‑Assessment ↔ Đoàn ngoài</h2><p>Giữ nguyên kết quả bệnh viện đã tự đánh giá; nhập điểm đoàn Sở Y tế để đối chiếu chênh lệch.</p></div><strong>{lifecycleStatus}</strong></div><div style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
    {error ? <div className="alert error">{error}</div> : null}{notice ? <div className="alert success">{notice}</div> : null}
    <div className="domain-metrics"><div><strong>{linkedSelf ? 1 : 0}</strong><span>Đợt self đã khóa</span></div><div><strong>{gaps.length}</strong><span>Tiêu chí chênh lệch</span></div><div><strong>{gaps.filter((x) => x.selfScore === x.externalScore).length}</strong><span>Không chênh lệch</span></div><div><strong>{evidence}</strong><span>Tài liệu đánh giá ngoài</span></div></div>
    {!linkedSelf && canReview && lifecycleStatus !== "CLOSED" ? <div className="detail-grid"><label><span>Đợt tự đánh giá đã chốt, cùng bộ tiêu chí</span><select value={selfId} onChange={(e) => setSelfId(e.target.value)}><option value="">Chọn đợt đối chiếu</option>{selfOptions.map((x) => <option value={x.id} key={x.id}>{x.label}</option>)}</select></label><div style={{ alignSelf: "end" }}><button className="button primary" disabled={busy || !selfId} onClick={() => run("LINK_SELF", { self_record_id: selfId })}>Khóa đợt đối chiếu</button></div></div> : null}
    {linkedSelf ? <div className="alert info">Đang đối chiếu với <strong>{linkedSelf.label}</strong>. Liên kết này được ghi audit trail.</div> : null}
    {linkedSelf && canReview && lifecycleStatus !== "CLOSED" ? <div className="page-stack"><h3>Nhập điểm đoàn Sở Y tế</h3><div className="detail-grid"><label><span>Mã tiêu chí *</span><input value={form.criterion_ref} onChange={(e) => setForm({ ...form, criterion_ref: e.target.value })} /></label><label><span>Điểm BV tự đánh giá *</span><input value={form.self_score} onChange={(e) => setForm({ ...form, self_score: e.target.value })} /></label><label><span>Điểm đoàn Sở Y tế *</span><input value={form.external_score} onChange={(e) => setForm({ ...form, external_score: e.target.value })} /></label><label className="wide"><span>Ghi chú (nếu có)</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label></div><button className="button primary" disabled={busy || !form.criterion_ref || !form.self_score || !form.external_score} onClick={() => run("CREATE_GAP_FINDING", form)}>Lưu điểm đối chiếu</button></div> : null}
    {gaps.length ? <div className="table-wrap"><table><thead><tr><th>Tiêu chí</th><th>BV tự đánh giá</th><th>Đoàn SYT</th><th>Chênh lệch</th></tr></thead><tbody>{gaps.map((x) => <tr key={x.id}><td><strong>{x.criterionRef}</strong></td><td>{x.selfScore}</td><td>{x.externalScore}</td><td>{Number.isFinite(Number(x.externalScore)) && Number.isFinite(Number(x.selfScore)) ? Number(x.externalScore) - Number(x.selfScore) : "—"}</td></tr>)}</tbody></table></div> : null}
    {linkedSelf && canManage && lifecycleStatus !== "CLOSED" ? <button className="button primary" disabled={busy || open > 0 || evidence < 1} onClick={() => { const comment = window.prompt("Kết luận đối chiếu đánh giá ngoài:"); if (comment?.trim()) run("CLOSE_COMPARISON", { comment: comment.trim() }); }}>Chốt đối chiếu</button> : null}
  </div></section>;
}
