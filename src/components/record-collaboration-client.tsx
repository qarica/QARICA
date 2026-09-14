"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RecordEvidenceItem = {
  id: string;
  title: string;
  original_file_name: string | null;
  file_size: number | null;
  validity_status: string;
  uploaded_at: string;
};

export type RecordCommentItem = {
  id: string;
  comment_text: string;
  created_at: string;
  author_name: string;
};

function fmtBytes(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function evidenceLabel(status: string) {
  if (status === "VALID") return "Đã xác minh";
  if (status === "REJECTED") return "Không hợp lệ";
  if (status === "EXPIRED") return "Hết hiệu lực";
  if (status === "SUPERSEDED") return "Đã thay thế";
  return "Chờ xác minh";
}

export function RecordCollaborationClient({
  recordId,
  lifecycleStatus,
  canUpload,
  evidence,
  comments,
}: {
  recordId: string;
  lifecycleStatus: string;
  canUpload: boolean;
  evidence: RecordEvidenceItem[];
  comments: RecordCommentItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const isActive = lifecycleStatus === "ACTIVE";

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Vui lòng chọn file minh chứng.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/records/${recordId}/evidence`, { method: "POST", body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không tải được minh chứng.");
      form.reset();
      setUploadOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được minh chứng.");
    } finally { setBusy(false); }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) { setError("Vui lòng nhập nội dung trao đổi."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/records/${recordId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_text: comment.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không lưu được trao đổi.");
      setComment(""); setCommentOpen(false); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được trao đổi.");
    } finally { setBusy(false); }
  }

  return <section className="panel record-collaboration-panel">
    <style>{`
      .record-collaboration-panel .rc-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;padding:18px 19px 12px}.record-collaboration-panel .rc-head h2{margin:0;font-size:19px}.record-collaboration-panel .rc-head p{margin:5px 0 0;color:#64757b;font-size:13px;line-height:1.45}.record-collaboration-panel .rc-actions{display:flex;gap:8px;flex-wrap:wrap}.record-collaboration-panel .rc-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:14px;padding:0 18px 18px}.record-collaboration-panel .rc-box{border:1px solid #dce7e9;border-radius:14px;background:#fff;overflow:hidden}.record-collaboration-panel .rc-box-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #edf2f3}.record-collaboration-panel .rc-box-head strong{font-size:14px}.record-collaboration-panel .rc-count{font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#eef5f5}.record-collaboration-panel .rc-list{display:grid}.record-collaboration-panel .rc-evidence,.record-collaboration-panel .rc-comment{padding:11px 14px;border-bottom:1px solid #edf2f3}.record-collaboration-panel .rc-evidence:last-child,.record-collaboration-panel .rc-comment:last-child{border-bottom:0}.record-collaboration-panel .rc-evidence{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.record-collaboration-panel .rc-name{font-weight:750;line-height:1.35}.record-collaboration-panel .rc-meta{font-size:11px;color:#708086;margin-top:3px;line-height:1.4}.record-collaboration-panel .rc-status{display:inline-flex;margin-top:6px;font-size:10px;font-weight:800;padding:3px 7px;border-radius:999px;background:#f5f7f8;color:#55666c}.record-collaboration-panel .rc-comment-text{white-space:pre-wrap;line-height:1.5;font-size:13px}.record-collaboration-panel .rc-empty{padding:18px 14px;color:#718087;font-size:13px}.record-collaboration-panel .rc-form{margin:0 18px 14px;padding:14px;border:1px solid #dce7e9;border-radius:14px;background:#f8fbfb}.record-collaboration-panel .rc-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.record-collaboration-panel .rc-form label{display:grid;gap:5px;font-size:12px;font-weight:700}.record-collaboration-panel .rc-form input,.record-collaboration-panel .rc-form textarea{width:100%;border:1px solid #ccdadd;border-radius:10px;padding:10px 11px;background:#fff;font:inherit}.record-collaboration-panel .rc-form textarea{min-height:90px;resize:vertical}.record-collaboration-panel .rc-form-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.record-collaboration-panel .rc-error{margin:0 18px 14px;padding:10px 12px;border-radius:10px;background:#fff4f4;color:#a63535;font-size:12px;font-weight:700}@media(max-width:820px){.record-collaboration-panel .rc-grid{grid-template-columns:1fr}.record-collaboration-panel .rc-form-grid{grid-template-columns:1fr}.record-collaboration-panel .rc-actions{width:100%}.record-collaboration-panel .rc-actions .button{flex:1;justify-content:center}.record-collaboration-panel .rc-evidence{grid-template-columns:1fr}.record-collaboration-panel .rc-evidence .button{width:max-content}}
    `}</style>
    <div className="rc-head"><div><h2>Minh chứng & trao đổi</h2><p>Mọi file và trao đổi nghiệp vụ được lưu ngay trong hồ sơ để không thất lạc khi chuyển qua email, chat hoặc thư mục cá nhân.</p></div><div className="rc-actions">
      {canUpload && isActive ? <button className="button secondary" type="button" onClick={() => { setUploadOpen((v) => !v); setCommentOpen(false); setError(""); }}>+ Minh chứng</button> : null}
      {isActive ? <button className="button secondary" type="button" onClick={() => { setCommentOpen((v) => !v); setUploadOpen(false); setError(""); }}>+ Trao đổi</button> : null}
    </div></div>
    {!isActive ? <div className="scope-note" style={{ margin: "0 18px 14px" }}>Hồ sơ đã không còn ở trạng thái hoạt động. Nội dung cũ vẫn xem được nhưng không thêm file hoặc trao đổi mới.</div> : null}
    {uploadOpen ? <form className="rc-form" onSubmit={submitEvidence}><div className="rc-form-grid"><label>Tiêu đề minh chứng<input name="title" placeholder="Nếu để trống sẽ dùng tên file" /></label><label>File minh chứng<input ref={fileRef} name="file" type="file" required /></label></div><div className="rc-form-buttons"><button className="button tertiary" type="button" onClick={() => setUploadOpen(false)}>Đóng</button><button className="button" disabled={busy} type="submit">{busy ? "Đang tải…" : "Lưu minh chứng"}</button></div></form> : null}
    {commentOpen ? <form className="rc-form" onSubmit={submitComment}><label>Nội dung trao đổi<textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ghi rõ việc cần phối hợp, phản hồi hoặc quyết định nghiệp vụ…" required /></label><div className="rc-form-buttons"><button className="button tertiary" type="button" onClick={() => setCommentOpen(false)}>Đóng</button><button className="button" disabled={busy} type="submit">{busy ? "Đang lưu…" : "Lưu trao đổi"}</button></div></form> : null}
    {error ? <div className="rc-error">{error}</div> : null}
    <div className="rc-grid">
      <div className="rc-box"><div className="rc-box-head"><strong>Minh chứng liên kết</strong><span className="rc-count">{evidence.length}</span></div><div className="rc-list">{evidence.length ? evidence.map((item) => <div className="rc-evidence" key={item.id}><div><div className="rc-name">{item.title}</div><div className="rc-meta">{item.original_file_name || "Tài liệu"} · {fmtBytes(item.file_size)} · {fmtDateTime(item.uploaded_at)}</div><span className="rc-status">{evidenceLabel(item.validity_status)}</span></div><a className="button tertiary small" href={`/api/evidence/${item.id}/download`} target="_blank" rel="noreferrer">Mở file</a></div>) : <div className="rc-empty">Chưa có minh chứng liên kết với hồ sơ này.</div>}</div></div>
      <div className="rc-box"><div className="rc-box-head"><strong>Trao đổi nghiệp vụ</strong><span className="rc-count">{comments.length}</span></div><div className="rc-list">{comments.length ? comments.map((item) => <div className="rc-comment" key={item.id}><div className="rc-comment-text">{item.comment_text}</div><div className="rc-meta">{item.author_name} · {fmtDateTime(item.created_at)}</div></div>) : <div className="rc-empty">Chưa có trao đổi trong hồ sơ.</div>}</div></div>
    </div>
  </section>;
}
