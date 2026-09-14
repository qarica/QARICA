"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL: Record<string, string> = { RECEIVED: "Đã tiếp nhận", TRIAGED: "Đã phân loại", COORDINATING: "Đang phối hợp", RESPONDED: "Đã phản hồi", CLOSED: "Đã đóng" };
export function FeedbackWorkflowClient({ recordId, status, canManage, evidence, finding }: { recordId: string; status: string; canManage: boolean; evidence: number; finding: { href: string; status: string } | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function run(action: string, payload: Record<string, unknown> = {}) { setBusy(true); setError(""); setNotice(""); try { const response = await fetch(`/api/feedback/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Không xử lý được phản ánh."); setNotice(result.message); router.refresh(); } catch (value) { setError(value instanceof Error ? value.message : "Không xử lý được phản ánh."); } finally { setBusy(false); } }
  const ask = (action: string, prompt: string) => { const comment = window.prompt(prompt); if (comment?.trim()) run(action, { comment: comment.trim() }); };
  return <section className="panel"><div className="panel-title"><div><h2>Feedback Workflow</h2><p>Tách phản hồi khách hàng khỏi khắc phục hệ thống; Finding tiếp tục độc lập sau khi phản hồi được đóng.</p></div><strong>{LABEL[status] || status}</strong></div><div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
    {error ? <div className="alert error">{error}</div> : null}{notice ? <div className="alert success">{notice}</div> : null}<div className="domain-metrics"><div><strong>{evidence}</strong><span>Minh chứng xác minh/phản hồi</span></div><div><strong>{finding ? 1 : 0}</strong><span>Finding hệ thống</span></div></div>
    {finding ? <div className="alert info">Finding liên quan: <Link href={finding.href}><strong>{finding.status}</strong></Link>. Việc đóng phản ánh không làm mất luồng khắc phục này.</div> : null}
    {canManage && status === "RECEIVED" ? <button className="button primary" disabled={busy} onClick={() => ask("TRIAGE", "Kết quả phân loại và mức ảnh hưởng:")}>Phân loại phản ánh</button> : null}
    {canManage && status === "TRIAGED" ? <button className="button primary" disabled={busy} onClick={() => run("START_COORDINATION")}>Chuyển phối hợp xác minh</button> : null}
    {canManage && ["TRIAGED", "COORDINATING"].includes(status) && !finding ? <button className="button secondary" disabled={busy} onClick={() => { const comment = window.prompt("Mô tả vấn đề hệ thống cần khắc phục:"); if (!comment?.trim()) return; const due = window.prompt("Hạn khắc phục (YYYY-MM-DD):"); if (due?.trim()) run("CREATE_FINDING", { comment: comment.trim(), due_date: due.trim(), severity: "MAJOR" }); }}>Tạo Finding hệ thống</button> : null}
    {canManage && ["TRIAGED", "COORDINATING"].includes(status) ? <button className="button primary" disabled={busy || evidence < 1} onClick={() => ask("MARK_RESPONDED", "Nội dung/kết quả phản hồi đã gửi khách hàng:")}>Xác nhận đã phản hồi</button> : null}
    {canManage && status === "RESPONDED" ? <button className="button primary" disabled={busy} onClick={() => ask("CLOSE", "Kết luận đóng luồng phản hồi:")}>Đóng phản ánh</button> : null}
  </div></section>;
}
