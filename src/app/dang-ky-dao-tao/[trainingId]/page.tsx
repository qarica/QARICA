"use client";

import { use, useEffect, useState } from "react";

type Department = { id: string; name: string };
type TrainingRound = { id: string; round_label: string };
type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "closed"; trainingName: string }
  | { kind: "open"; trainingName: string; departments: Department[]; rounds: TrainingRound[] };

const JOB_TITLE_OPTIONS = ["Bác sĩ", "Điều dưỡng/Hộ sinh/Kỹ thuật y", "Nhân viên văn phòng", "Khác"] as const;

export default function PublicTrainingRegistrationPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [roundId, setRoundId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobTitleOption, setJobTitleOption] = useState("");
  const [jobTitleOther, setJobTitleOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/training-registration/${trainingId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "not_found" });
          return;
        }
        if (!body.open) {
          setState({ kind: "closed", trainingName: body.trainingName || "" });
          return;
        }
        setState({ kind: "open", trainingName: body.trainingName || "", departments: body.departments || [], rounds: body.rounds || [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [trainingId]);

  async function submit() {
    if (state.kind !== "open") return;
    setSubmitError("");
    setSubmitting(true);
    const res = await fetch(`/api/public/training-registration/${trainingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_name: employeeName,
        employee_code: employeeCode,
        round_id: roundId,
        department_id: departmentId,
        job_title: jobTitleOption === "Khác" ? jobTitleOther.trim() : jobTitleOption,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(body.error || "Không đăng ký được, vui lòng thử lại.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="prg-page">
      <div className="prg-card">
        <div className="prg-brand">QARICA</div>

        {state.kind === "loading" ? <div className="loading-state">Đang tải...</div> : null}

        {state.kind === "not_found" ? <div className="alert error">Không tìm thấy đợt đào tạo này. Vui lòng quét lại mã QR hoặc liên hệ bộ phận QLCL.</div> : null}

        {state.kind === "closed" ? (
          <div className="prg-closed">
            <h1>{state.trainingName}</h1>
            <div className="alert error">Đợt đào tạo này hiện chưa mở đăng ký. Vui lòng chờ cán bộ phụ trách mở trước khi quét lại.</div>
          </div>
        ) : null}

        {state.kind === "open" && !done ? (
          <form
            className="prg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1>{state.trainingName}</h1>
            <p className="muted">Đăng ký tham gia đào tạo</p>
            {submitError ? <div className="alert error">{submitError}</div> : null}

            <label>
              <span>Họ và tên *</span>
              <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Nguyễn Văn A" />
            </label>
            <label>
              <span>Mã nhân viên (tùy chọn)</span>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="NV0012" />
            </label>
            {state.rounds.length ? (
              <label>
                <span>Buổi/đợt đào tạo *</span>
                <select value={roundId} onChange={(e) => setRoundId(e.target.value)} required>
                  <option value="">— Chọn buổi/đợt —</option>
                  {state.rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.round_label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>Đơn vị công tác (tùy chọn)</span>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— Chọn khoa/phòng —</option>
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Chức danh chuyên môn (tùy chọn)</span>
              <div className="radio-row">
                {JOB_TITLE_OPTIONS.map((opt) => (
                  <label key={opt}>
                    <input type="radio" name="job-title" value={opt} checked={jobTitleOption === opt} onChange={() => setJobTitleOption(opt)} />
                    {opt}
                  </label>
                ))}
              </div>
            </label>
            {jobTitleOption === "Khác" ? (
              <label>
                <span>Chức danh cụ thể</span>
                <input value={jobTitleOther} onChange={(e) => setJobTitleOther(e.target.value)} placeholder="VD: BS Trưởng khoa" />
              </label>
            ) : null}

            <button type="submit" className="button primary wide" disabled={submitting || !employeeName.trim() || (state.rounds.length > 0 && !roundId)}>
              {submitting ? "Đang đăng ký..." : "Đăng ký"}
            </button>
          </form>
        ) : null}

        {done ? (
          <div className="prg-result">
            <h1>Đã đăng ký thành công</h1>
            <p className="muted">Cảm ơn {employeeName} đã đăng ký tham gia đào tạo. Vui lòng tham dự đúng thời gian/địa điểm đã thông báo.</p>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .prg-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 24px 16px;
        }
        .prg-card {
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
        .prg-brand {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--brand);
        }
        .prg-form,
        .prg-closed,
        .prg-result {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .prg-form h1,
        .prg-closed h1,
        .prg-result h1 {
          margin: 0;
          font-size: 20px;
        }
      `}</style>
    </main>
  );
}
