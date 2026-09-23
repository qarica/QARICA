"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DictationTextarea } from "@/components/dictation-textarea";

const LABEL: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận",
  TRIAGED: "Đã phân loại",
  COORDINATING: "Đang phối hợp",
  RESPONDED: "Đã phản hồi",
  CLOSED: "Đã đóng",
};

type DraftAction = "TRIAGE" | "CREATE_FINDING" | "MARK_RESPONDED" | "CLOSE" | null;

export function FeedbackWorkflowClient({
  recordId,
  status,
  canManage,
  evidence,
  finding,
}: {
  recordId: string;
  status: string;
  canManage: boolean;
  evidence: number;
  finding: { href: string; status: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftAction, setDraftAction] = useState<DraftAction>(null);
  const [comment, setComment] = useState("");
  const [dueDate, setDueDate] = useState("");

  function openDraft(action: Exclude<DraftAction, null>) {
    setDraftAction(action);
    setComment("");
    setDueDate("");
    setError("");
    setNotice("");
  }

  function closeDraft() {
    if (busy) return;
    setDraftAction(null);
    setComment("");
    setDueDate("");
  }

  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/feedback/${recordId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không xử lý được phản ánh.");
      setNotice(result.message);
      setDraftAction(null);
      setComment("");
      setDueDate("");
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không xử lý được phản ánh.");
    } finally {
      setBusy(false);
    }
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const note = comment.trim();
    if (!draftAction || !note) return;

    if (draftAction === "CREATE_FINDING") {
      if (!dueDate) {
        setError("Cần chọn hạn khắc phục.");
        return;
      }
      void run("CREATE_FINDING", { comment: note, due_date: dueDate, severity: "MAJOR" });
      return;
    }
    void run(draftAction, { comment: note });
  }

  const draftTitle =
    draftAction === "TRIAGE" ? "Kết quả phân loại và mức ảnh hưởng"
    : draftAction === "CREATE_FINDING" ? "Mô tả vấn đề hệ thống cần khắc phục"
    : draftAction === "MARK_RESPONDED" ? "Nội dung/kết quả phản hồi đã gửi khách hàng"
    : draftAction === "CLOSE" ? "Kết luận đóng luồng phản hồi"
    : "";

  return (
    <section className="panel feedback-workflow">
      <div className="panel-title">
        <div>
          <h2>Feedback Workflow</h2>
          <p>Tách phản hồi khách hàng khỏi khắc phục hệ thống; Finding tiếp tục độc lập sau khi phản hồi được đóng.</p>
        </div>
        <strong>{LABEL[status] || status}</strong>
      </div>

      <div className="feedback-body">
        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        <div className="domain-metrics">
          <div><strong>{evidence}</strong><span>Minh chứng xác minh/phản hồi</span></div>
          <div><strong>{finding ? 1 : 0}</strong><span>Finding hệ thống</span></div>
        </div>

        {finding ? (
          <div className="alert info">
            Finding liên quan: <Link href={finding.href}><strong>{finding.status}</strong></Link>. Việc đóng phản ánh không làm mất luồng khắc phục này.
          </div>
        ) : null}

        <div className="feedback-actions">
          {canManage && status === "RECEIVED" ? (
            <button className="button primary" disabled={busy} onClick={() => openDraft("TRIAGE")}>Phân loại phản ánh</button>
          ) : null}

          {canManage && status === "TRIAGED" ? (
            <button className="button primary" disabled={busy} onClick={() => void run("START_COORDINATION")}>Chuyển phối hợp xác minh</button>
          ) : null}

          {canManage && ["TRIAGED", "COORDINATING"].includes(status) && !finding ? (
            <button className="button secondary" disabled={busy} onClick={() => openDraft("CREATE_FINDING")}>Tạo Finding hệ thống</button>
          ) : null}

          {canManage && ["TRIAGED", "COORDINATING"].includes(status) ? (
            <button className="button primary" disabled={busy || evidence < 1} onClick={() => openDraft("MARK_RESPONDED")}>Xác nhận đã phản hồi</button>
          ) : null}

          {canManage && status === "RESPONDED" ? (
            <button className="button primary" disabled={busy} onClick={() => openDraft("CLOSE")}>Đóng phản ánh</button>
          ) : null}
        </div>

        {draftAction ? (
          <form className="feedback-draft" onSubmit={submitDraft}>
            <label>
              {draftTitle} *
              <DictationTextarea
                rows={4}
                value={comment}
                onValueChange={setComment}
                disabled={busy}
                placeholder="Ghi nội dung đã xác minh hoặc trao đổi thực tế; có thể dùng nhập bằng giọng nói rồi kiểm tra lại trước khi lưu."
              />
            </label>

            {draftAction === "CREATE_FINDING" ? (
              <label>
                Hạn khắc phục *
                <input type="date" value={dueDate} disabled={busy} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            ) : null}

            <div className="feedback-draft-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={closeDraft}>Hủy</button>
              <button className="button primary" disabled={busy || !comment.trim() || (draftAction === "CREATE_FINDING" && !dueDate)}>
                {busy ? "Đang xử lý..." : "Xác nhận"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <style>{`
        .feedback-body{padding:0 18px 18px;display:grid;gap:12px}
        .feedback-actions{display:flex;gap:8px;flex-wrap:wrap}
        .feedback-draft{display:grid;gap:10px;border:1px solid #dfe8ea;border-radius:12px;padding:12px;background:#fbfdfd}
        .feedback-draft label{display:grid;gap:5px;font-size:11px;font-weight:750;color:#44545a}
        .feedback-draft input{width:100%}
        .feedback-draft-actions{display:flex;justify-content:flex-end;gap:8px}
      `}</style>
    </section>
  );
}
