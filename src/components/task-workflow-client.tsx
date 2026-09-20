"use client";

import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type WorkflowAction = "START" | "RESUME" | "SUBMIT" | "BEGIN_VERIFY" | "APPROVE" | "RETURN";

export function TaskWorkflowClient({
  recordId,
  currentStatus,
  canOperate,
  canVerify,
  evidenceCount,
  departmentExecutionId,
  departmentExecutionStatus,
}: {
  recordId: string;
  currentStatus: string;
  canOperate: boolean;
  canVerify: boolean;
  evidenceCount: number;
  departmentExecutionId?: string | null;
  departmentExecutionStatus?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reviewOpen, setReviewOpen] = useState<"APPROVE" | "RETURN" | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  if (!canOperate && !canVerify) return null;

  async function runWorkflow(action: WorkflowAction, note?: string) {
    if (action === "SUBMIT" && evidenceCount < 1) {
      setMessage("Cần nộp ít nhất 01 minh chứng trước khi gửi xác minh.");
      return;
    }
    if (action === "SUBMIT" && !window.confirm("Gửi công việc và toàn bộ minh chứng hiện tại để xác minh?")) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tasks/${recordId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note?.trim() || null, department_execution_id: departmentExecutionId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không cập nhật được trạng thái công việc.");
      setReviewOpen(null);
      setReviewNote("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(e: FormEvent) {
    e.preventDefault();
    if (!file) return setMessage("Vui lòng chọn file minh chứng.");

    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("title", evidenceTitle.trim());
      const res = await fetch(`/api/tasks/${recordId}/evidence`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tải minh chứng.");
      setEvidenceTitle("");
      setFile(null);
      setUploadOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewOpen) return;
    if (reviewOpen === "RETURN" && reviewNote.trim().length < 5) {
      setMessage("Vui lòng ghi rõ nội dung cần bổ sung.");
      return;
    }
    await runWorkflow(reviewOpen, reviewNote);
  }

  const uploadModal = uploadOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}>
      <form className="modal-card" onSubmit={uploadEvidence} style={{ width: "min(900px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", borderRadius: 18 }}>
        <div className="modal-head" style={{ padding: "18px 24px" }}>
          <div>
            <div className="eyebrow">MINH CHỨNG CÔNG VIỆC</div>
            <h2>Nộp minh chứng</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>File được lưu trong kho minh chứng riêng tư và liên kết trực tiếp với công việc này.</p>
          </div>
          <button type="button" className="icon-button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={() => !busy && setUploadOpen(false)}><Icon name="x" size={22} /></button>
        </div>
        <div className="modal-body" style={{ padding: "24px 28px 30px" }}>
          <div className="form-stack" style={{ gap: 18 }}>
            <label><span>Tên minh chứng</span><input value={evidenceTitle} onChange={(e) => setEvidenceTitle(e.target.value)} placeholder="Có thể để trống, hệ thống sẽ dùng tên file" /></label>
            <label>
              <span>Chọn file *</span>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <small>Hỗ trợ tài liệu, bảng tính, ảnh và ZIP; tối đa 25 MB/file.</small>
            </label>
            {file ? <div className="scope-note"><strong>Đã chọn:</strong> {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div> : null}
          </div>
        </div>
        <div className="modal-footer" style={{ padding: "14px 24px" }}>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setUploadOpen(false)}>Hủy / Đóng</button>
          <button className="button primary" disabled={busy}><Icon name="file-input" size={17} /> {busy ? "Đang tải..." : "Tải minh chứng"}</button>
        </div>
      </form>
    </div>,
    document.body,
  ) : null;

  const reviewModal = reviewOpen && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 16 }}>
      <form className="modal-card" onSubmit={submitReview} style={{ width: "min(760px, calc(100vw - 32px))", borderRadius: 18 }}>
        <div className="modal-head" style={{ padding: "18px 24px" }}>
          <div>
            <div className="eyebrow">XÁC MINH CÔNG VIỆC</div>
            <h2>{reviewOpen === "RETURN" ? "Trả lại bổ sung" : "Xác minh đạt"}</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>{reviewOpen === "RETURN" ? "Nêu rõ nội dung người thực hiện cần bổ sung trước khi gửi lại." : "Xác nhận minh chứng đáp ứng kết quả mong đợi của nhiệm vụ."}</p>
          </div>
          <button type="button" className="icon-button" title="Đóng cửa sổ" aria-label="Đóng cửa sổ" onClick={() => !busy && setReviewOpen(null)}><Icon name="x" size={22} /></button>
        </div>
        <div className="modal-body" style={{ padding: "24px 28px 30px" }}>
          <label>
            <span>{reviewOpen === "RETURN" ? "Nội dung cần bổ sung *" : "Nhận xét xác minh"}</span>
            <textarea rows={5} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={reviewOpen === "RETURN" ? "Ví dụ: Bổ sung bản đã ký phê duyệt và cập nhật ngày hiệu lực..." : "Có thể ghi nhận xét ngắn hoặc để trống"} />
          </label>
        </div>
        <div className="modal-footer" style={{ padding: "14px 24px" }}>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setReviewOpen(null)}>Hủy / Đóng</button>
          <button className="button primary" disabled={busy}>{busy ? "Đang xử lý..." : reviewOpen === "RETURN" ? "Trả lại bổ sung" : "Xác nhận hoàn thành"}</button>
        </div>
      </form>
    </div>,
    document.body,
  ) : null;

  let controls: React.ReactNode = null;
  const operationalStatus = departmentExecutionId && departmentExecutionStatus ? departmentExecutionStatus : currentStatus;
  if (canVerify && departmentExecutionId && departmentExecutionStatus === "SUBMITTED") {
    controls = <>
      <button type="button" className="button secondary" onClick={() => { setMessage(null); setReviewNote(""); setReviewOpen("RETURN"); }} disabled={busy}>Trả lại bổ sung</button>
      <button type="button" className="button primary" onClick={() => { setMessage(null); setReviewNote(""); setReviewOpen("APPROVE"); }} disabled={busy}><Icon name="shield-check" size={17} /> Xác minh đạt</button>
    </>;
  } else if (operationalStatus === "NOT_STARTED" && canOperate) {
    controls = <button type="button" className="button primary" onClick={() => runWorkflow("START")} disabled={busy}>{busy ? "Đang cập nhật..." : "Bắt đầu thực hiện"}</button>;
  } else if (operationalStatus === "RETURNED" && canOperate) {
    controls = <button type="button" className="button primary" onClick={() => runWorkflow("RESUME")} disabled={busy}>{busy ? "Đang cập nhật..." : "Tiếp tục thực hiện"}</button>;
  } else if (operationalStatus === "IN_PROGRESS" && canOperate) {
    controls = <>
      <button type="button" className="button secondary" onClick={() => { setMessage(null); setUploadOpen(true); }} disabled={busy}><Icon name="file-input" size={17} /> Nộp minh chứng</button>
      <button type="button" className="button primary" onClick={() => runWorkflow("SUBMIT")} disabled={busy || evidenceCount < 1}><Icon name="send" size={17} /> {busy ? "Đang gửi..." : "Gửi xác minh"}</button>
    </>;
  } else if (operationalStatus === "EVIDENCE_SUBMITTED") {
    controls = canVerify
      ? <button type="button" className="button primary" onClick={() => runWorkflow("BEGIN_VERIFY")} disabled={busy}>{busy ? "Đang cập nhật..." : "Bắt đầu xác minh"}</button>
      : <span className="code-pill">Đã gửi xác minh</span>;
  } else if (operationalStatus === "VERIFYING") {
    controls = canVerify ? <>
      <button type="button" className="button secondary" onClick={() => { setMessage(null); setReviewNote(""); setReviewOpen("RETURN"); }} disabled={busy}>Trả lại bổ sung</button>
      <button type="button" className="button primary" onClick={() => { setMessage(null); setReviewNote(""); setReviewOpen("APPROVE"); }} disabled={busy}><Icon name="shield-check" size={17} /> Xác minh đạt</button>
    </> : <span className="code-pill">Đang xác minh</span>;
  } else if (operationalStatus === "COMPLETED" || operationalStatus === "VERIFIED") {
    controls = (
      <div
        role="status"
        aria-label={departmentExecutionId ? "Phần việc của khoa/phòng đã hoàn thành" : "Nhiệm vụ đã hoàn thành"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px 9px 10px",
          borderRadius: 14,
          border: "1px solid #86efac",
          background: "linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)",
          color: "#166534",
          boxShadow: "0 4px 14px rgba(22, 101, 52, 0.12)",
          minWidth: 235,
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#16a34a",
            color: "white",
            flexShrink: 0,
          }}
        >
          <Icon name="badge-check" size={20} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.25 }}>
          <strong style={{ fontSize: 13, letterSpacing: ".01em" }}>{departmentExecutionId ? "PHẦN VIỆC CỦA KHOA/PHÒNG ĐÃ HOÀN THÀNH" : "NHIỆM VỤ ĐÃ HOÀN THÀNH"}</strong>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#15803d" }}>
            Đã xác minh · {evidenceCount} minh chứng
          </span>
        </span>
      </div>
    );
  }

  if (!controls && !message) return null;

  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {message ? <span className="tiny" style={{ color: "#b42318" }}>{message}</span> : null}
      {controls}
    </div>
    {uploadModal}
    {reviewModal}
  </>;
}
