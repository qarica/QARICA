"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL: Record<string, string> = { DRAFT: "Nháp", REVIEWING: "Đang rà soát", PUBLISHED: "Đã phát hành", ARCHIVED: "Hết hiệu lực" };
export function SafetyAlertWorkflowClient({ recordId, status, canInvestigate, canApprove, contentReady, evidence, expiresAt }: { recordId: string; status: string; canInvestigate: boolean; canApprove: boolean; contentReady: boolean; evidence: number; expiresAt: string | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function run(action: string, comment?: string) { setBusy(true); setError(""); setNotice(""); try { const response = await fetch(`/api/safety-alerts/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Không xử lý được cảnh báo."); setNotice(result.message); router.refresh(); } catch (value) { setError(value instanceof Error ? value.message : "Không xử lý được cảnh báo."); } finally { setBusy(false); } }
  const ask = (action: string, prompt: string) => { const comment = window.prompt(prompt); if (comment?.trim()) run(action, comment.trim()); };
  return <section className="panel"><div className="panel-title"><div><h2>Safety Alert Workflow</h2><p>Soạn bài học → rà soát → phát hành → hết hiệu lực; nguồn và quyết định được lưu audit trail.</p></div><strong>{LABEL[status] || status}</strong></div><div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
    {error ? <div className="alert error">{error}</div> : null}{notice ? <div className="alert success">{notice}</div> : null}<div className="domain-metrics"><div><strong>{contentReady ? "Đủ" : "Thiếu"}</strong><span>Nội dung cốt lõi</span></div><div><strong>{evidence}</strong><span>Nguồn/minh chứng rà soát</span></div><div><strong>{expiresAt ? new Date(expiresAt).toLocaleDateString("vi-VN") : "—"}</strong><span>Hết hiệu lực</span></div></div>
    {status === "DRAFT" && canInvestigate ? <button className="button primary" disabled={busy || !contentReady} onClick={() => run("SUBMIT_REVIEW")}>Gửi rà soát nội dung</button> : null}
    {status === "REVIEWING" && canApprove ? <><button className="button primary" disabled={busy || evidence < 1} onClick={() => ask("PUBLISH", "Kết luận phê duyệt phát hành:")}>Phát hành cảnh báo</button><button className="button secondary" disabled={busy} onClick={() => ask("RETURN", "Lý do trả lại chỉnh sửa:")}>Trả lại chỉnh sửa</button></> : null}
    {status === "PUBLISHED" && canApprove ? <button className="button secondary" disabled={busy} onClick={() => ask("ARCHIVE", "Lý do lưu hết hiệu lực/thay thế:")}>Lưu hết hiệu lực</button> : null}
  </div></section>;
}
