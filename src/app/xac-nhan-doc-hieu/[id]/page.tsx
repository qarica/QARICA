"use client";

import { use, useEffect, useState } from "react";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "closed"; title: string }
  | { kind: "open"; title: string; documentCode: string | null; versionLabel: string };

export default function PublicDocumentAckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/document-ack/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "not_found" });
          return;
        }
        if (!body.open) {
          setState({ kind: "closed", title: body.title || "" });
          return;
        }
        setState({ kind: "open", title: body.title || "", documentCode: body.documentCode ?? null, versionLabel: body.versionLabel || "" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit() {
    setSubmitError("");
    setSubmitting(true);
    const res = await fetch(`/api/public/document-ack/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_name: employeeName, employee_code: employeeCode }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(body.error || "Không xác nhận được, vui lòng thử lại.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="pda-page">
      <div className="pda-card">
        <div className="pda-brand">QARICA</div>

        {state.kind === "loading" ? <div className="loading-state">Đang tải...</div> : null}

        {state.kind === "not_found" ? <div className="alert error">Không tìm thấy văn bản này. Vui lòng kiểm tra lại đường link.</div> : null}

        {state.kind === "closed" ? (
          <div className="pda-closed">
            <h1>{state.title}</h1>
            <div className="alert error">Văn bản này hiện không áp dụng xác nhận tự đọc hiểu (chưa phát hành hoặc không chọn hình thức Tự đọc hiểu).</div>
          </div>
        ) : null}

        {state.kind === "open" && !done ? (
          <form
            className="pda-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1>{state.title}</h1>
            <p className="muted">
              {state.documentCode ? `${state.documentCode} · ` : ""}
              {state.versionLabel}
            </p>
            {submitError ? <div className="alert error">{submitError}</div> : null}
            <label>
              <span>Họ và tên *</span>
              <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Nguyễn Văn A" />
            </label>
            <label>
              <span>Mã nhân viên *</span>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} required placeholder="NV0012" />
            </label>
            <button type="submit" className="button primary wide" disabled={submitting}>
              {submitting ? "Đang gửi..." : "Tôi đã đọc và hiểu nội dung văn bản này"}
            </button>
          </form>
        ) : null}

        {done ? (
          <div className="pda-result">
            <h1>Đã ghi nhận xác nhận của bạn</h1>
            <p className="muted">Cảm ơn bạn đã xác nhận đã đọc và hiểu nội dung văn bản.</p>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .pda-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 24px 16px;
        }
        .pda-card {
          width: min(480px, 100%);
          background: #fff;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 26px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pda-brand {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--brand);
        }
        .pda-form,
        .pda-closed,
        .pda-result {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pda-form h1,
        .pda-closed h1,
        .pda-result h1 {
          margin: 0;
          font-size: 20px;
        }
      `}</style>
    </main>
  );
}
