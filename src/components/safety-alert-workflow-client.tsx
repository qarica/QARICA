"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DictationTextarea } from "@/components/dictation-textarea";

const LABEL: Record<string, string> = { DRAFT: "Nháp", REVIEWING: "Đang rà soát", PUBLISHED: "Đã phát hành", ARCHIVED: "Hết hiệu lực" };

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SafetyAlertWorkflowClient({ recordId, status, canInvestigate, canApprove, contentReady, evidence, expiresAt }: { recordId: string; status: string; canInvestigate: boolean; canApprove: boolean; contentReady: boolean; evidence: number; expiresAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState("");
  const [lesson, setLesson] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [expires, setExpires] = useState(localDateTimeValue(expiresAt));

  const loadContent = useCallback(async () => {
    if (!canInvestigate) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/safety-alerts/${recordId}/content`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không đọc được nội dung cảnh báo.");
      setSummary(result.summary || "");
      setLesson(result.lesson || "");
      setRecommendation(result.recommendation || "");
      setExpires(localDateTimeValue(result.expires_at || null));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không đọc được nội dung cảnh báo.");
    } finally {
      setLoading(false);
    }
  }, [canInvestigate, recordId]);

  useEffect(() => { void loadContent(); }, [loadContent]);

  async function run(action: string, comment?: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/safety-alerts/${recordId}/workflow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không xử lý được cảnh báo.");
      setNotice(result.message || "Đã cập nhật cảnh báo.");
      router.refresh();
      await loadContent();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không xử lý được cảnh báo.");
    } finally { setBusy(false); }
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/safety-alerts/${recordId}/content`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary, lesson, recommendation, expires_at: expires || null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không lưu được nội dung nháp.");
      setNotice(result.message || "Đã lưu nội dung nháp.");
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không lưu được nội dung nháp.");
    } finally { setBusy(false); }
  }

  const ask = (action: string, prompt: string) => { const comment = window.prompt(prompt); if (comment?.trim()) void run(action, comment.trim()); };
  const draftReady = !!summary.trim() && !!lesson.trim() && !!recommendation.trim();

  return <section className="panel">
    <div className="panel-title"><div><h2>Safety Alert Workflow</h2><p>Soạn bài học → rà soát → phát hành → hết hiệu lực; nguồn và quyết định được lưu audit trail.</p></div><strong>{LABEL[status] || status}</strong></div>
    <div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }}>
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}
      <div className="domain-metrics">
        <div><strong>{status === "DRAFT" ? (draftReady ? "Đủ" : "Thiếu") : (contentReady ? "Đủ" : "Thiếu")}</strong><span>Nội dung cốt lõi</span></div>
        <div><strong>{evidence}</strong><span>Nguồn/minh chứng rà soát</span></div>
        <div><strong>{expiresAt ? new Date(expiresAt).toLocaleDateString("vi-VN") : "—"}</strong><span>Hết hiệu lực</span></div>
      </div>

      {status === "DRAFT" && canInvestigate ? <form onSubmit={saveDraft} className="domain-detail-grid">
        <div className="wide alert" style={{ fontSize: 12 }}>Bản Nháp — kể cả nội dung vừa bị trả lại — được phép chỉnh sửa. Khi đã gửi rà soát hoặc phát hành, nội dung được khóa để bảo toàn dấu vết.</div>
        <label className="wide">Tóm tắt sự việc / nguy cơ *<DictationTextarea rows={3} value={summary} onValueChange={setSummary} placeholder="Mô tả ngắn, không định danh người bệnh nếu không cần thiết." /></label>
        <label className="wide">Bài học an toàn *<DictationTextarea rows={4} value={lesson} onValueChange={setLesson} placeholder="Điều hệ thống cần ghi nhớ từ sự việc hoặc nguy cơ." /></label>
        <label className="wide">Khuyến nghị áp dụng *<DictationTextarea rows={4} value={recommendation} onValueChange={setRecommendation} placeholder="Hành động/biện pháp phòng ngừa cụ thể cho các đơn vị liên quan." /></label>
        <label>Hết hiệu lực / rà soát lại<input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <button className="button secondary" disabled={busy || loading}>Lưu nội dung nháp</button>
      </form> : null}

      {status === "DRAFT" && canInvestigate ? <button className="button primary" disabled={busy || loading || !draftReady} onClick={() => void run("SUBMIT_REVIEW")}>Gửi rà soát nội dung</button> : null}
      {status === "REVIEWING" && canApprove ? <><button className="button primary" disabled={busy || evidence < 1} onClick={() => ask("PUBLISH", "Kết luận phê duyệt phát hành:")}>Phát hành cảnh báo</button><button className="button secondary" disabled={busy} onClick={() => ask("RETURN", "Lý do trả lại chỉnh sửa:")}>Trả lại chỉnh sửa</button></> : null}
      {status === "PUBLISHED" && canApprove ? <button className="button secondary" disabled={busy} onClick={() => ask("ARCHIVE", "Lý do lưu hết hiệu lực/thay thế:")}>Lưu hết hiệu lực</button> : null}
    </div>
  </section>;
}
