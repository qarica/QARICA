"use client";

import { use, useEffect, useState } from "react";

type Department = { id: string; name: string };
type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "closed"; trainingName: string }
  | { kind: "open"; trainingName: string; departments: Department[] };
type CheckInResult = { alreadyCheckedIn: boolean; employeeName: string; checkedInAt: string | null };

// Cùng danh sách chức danh với lam-bai/[roundId]/page.tsx và dang-ky-dao-tao — giữ đồng bộ 3 nơi.
const JOB_TITLE_OPTIONS = ["Bác sĩ", "Dược sĩ", "Điều dưỡng/Hộ sinh/Kỹ thuật viên", "Nhân viên văn phòng", "Khác"] as const;

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

// "Tập huấn chỉ quét QR điểm danh, chưa cần làm test" — quét mã QR của lớp tập huấn, nhập họ
// tên (+ mã NV, đơn vị, chức danh) là xong; không có bài kiểm tra nào.
export default function PublicTrainingAttendancePage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobTitleOption, setJobTitleOption] = useState("");
  const [jobTitleOther, setJobTitleOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/training-attendance/${trainingId}`)
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
        setState({ kind: "open", trainingName: body.trainingName || "", departments: body.departments || [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [trainingId]);

  async function submit() {
    if (state.kind !== "open" || submitting) return;
    setSubmitError("");
    setSubmitting(true);
    const res = await fetch(`/api/public/training-attendance/${trainingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_name: employeeName,
        employee_code: employeeCode,
        department_id: departmentId,
        job_title: jobTitleOption === "Khác" ? jobTitleOther.trim() : jobTitleOption,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(body.error || "Không điểm danh được, vui lòng thử lại.");
      return;
    }
    setResult({ alreadyCheckedIn: !!body.alreadyCheckedIn, employeeName: body.attendee?.employee_name || employeeName, checkedInAt: body.attendee?.checked_in_at ?? null });
  }

  return (
    <main className="pda-page">
      <div className="pda-card">
        <div className="pda-brand">QARICA</div>

        {state.kind === "loading" ? <div className="loading-state">Đang tải...</div> : null}

        {state.kind === "not_found" ? <div className="alert error">Không tìm thấy lớp tập huấn này. Vui lòng quét lại mã QR hoặc liên hệ bộ phận QLCL.</div> : null}

        {state.kind === "closed" ? (
          <div className="pda-section">
            <h1>{state.trainingName}</h1>
            <div className="alert error">Lớp tập huấn này hiện chưa mở điểm danh. Vui lòng chờ cán bộ phụ trách mở trước khi quét lại.</div>
          </div>
        ) : null}

        {state.kind === "open" && !result ? (
          <form
            className="pda-section"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1>{state.trainingName}</h1>
            <p className="muted">Điểm danh tham dự tập huấn</p>
            {submitError ? <div className="alert error">{submitError}</div> : null}

            <label>
              <span>Họ và tên *</span>
              <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Nguyễn Văn A" autoComplete="name" />
            </label>
            <label>
              <span>Mã nhân viên (tùy chọn)</span>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="NV0012" />
            </label>
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

            <button type="submit" className="button primary wide" disabled={submitting || !employeeName.trim()}>
              {submitting ? "Đang điểm danh..." : "Điểm danh"}
            </button>
          </form>
        ) : null}

        {result ? (
          <div className="pda-section">
            <h1>{result.alreadyCheckedIn ? "Bạn đã điểm danh trước đó" : "Điểm danh thành công"}</h1>
            <p className="muted">
              {result.alreadyCheckedIn
                ? `${result.employeeName} đã được ghi nhận tham dự lớp tập huấn này${result.checkedInAt ? ` (lúc ${formatTime(result.checkedInAt)})` : ""}. Không cần quét lại.`
                : `Cảm ơn ${result.employeeName}. Đã ghi nhận tham dự lúc ${formatTime(result.checkedInAt)}.`}
            </p>
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
        .pda-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pda-section h1 {
          margin: 0;
          font-size: 20px;
        }
      `}</style>
    </main>
  );
}
