"use client";

import { use, useEffect, useState } from "react";

type Question = { question_no: number; question_text: string; choices: string[] | null };
type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "closed"; trainingName: string; roundLabel: string }
  | { kind: "open"; trainingName: string; roundLabel: string; scoreMax: number | null; questions: Question[] };
type SubmitResult = { score: number; scoreMax: number | null; total: number; correctCount: number; perQuestion: { question_no: number; is_correct: boolean }[] };

export default function PublicTrainingTestPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/training-test/${roundId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "not_found" });
          return;
        }
        if (!body.open) {
          setState({ kind: "closed", trainingName: body.trainingName || "", roundLabel: body.roundLabel || "" });
          return;
        }
        setState({ kind: "open", trainingName: body.trainingName || "", roundLabel: body.roundLabel || "", scoreMax: body.scoreMax ?? null, questions: body.questions || [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  async function submit() {
    if (state.kind !== "open") return;
    setSubmitError("");
    setSubmitting(true);
    const res = await fetch(`/api/public/training-test/${roundId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_name: employeeName,
        employee_code: employeeCode,
        answers: state.questions.map((q) => ({ question_no: q.question_no, answer_text: answers[q.question_no] || "" })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(body.error || "Không nộp được bài, vui lòng thử lại.");
      return;
    }
    setResult(body as SubmitResult);
  }

  return (
    <main className="pbt-page">
      <div className="pbt-card">
        <div className="pbt-brand">QARICA</div>

        {state.kind === "loading" ? <div className="loading-state">Đang tải đề bài...</div> : null}

        {state.kind === "not_found" ? <div className="alert error">Không tìm thấy đợt kiểm tra này. Vui lòng quét lại mã QR hoặc liên hệ bộ phận QLCL.</div> : null}

        {state.kind === "closed" ? (
          <div className="pbt-closed">
            <h1>{state.trainingName}</h1>
            <p className="muted">{state.roundLabel}</p>
            <div className="alert error">Đợt kiểm tra này hiện chưa mở để làm bài. Vui lòng chờ cán bộ phụ trách mở trước khi quét lại.</div>
          </div>
        ) : null}

        {state.kind === "open" && !result ? (
          <form
            className="pbt-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1>{state.trainingName}</h1>
            <p className="muted">{state.roundLabel}</p>
            {submitError ? <div className="alert error">{submitError}</div> : null}

            <label>
              <span>Họ và tên *</span>
              <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Nguyễn Văn A" />
            </label>
            <label>
              <span>Mã nhân viên *</span>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} required placeholder="NV0012" />
            </label>

            <div className="pbt-questions">
              {state.questions.map((q, idx) => (
                <div key={q.question_no} className="pbt-question">
                  <strong>
                    Câu {idx + 1}. {q.question_text}
                  </strong>
                  {q.choices ? (
                    <div className="radio-row">
                      {q.choices.map((choice) => (
                        <label key={choice}>
                          <input
                            type="radio"
                            name={`q-${q.question_no}`}
                            value={choice}
                            checked={answers[q.question_no] === choice}
                            onChange={() => setAnswers((v) => ({ ...v, [q.question_no]: choice }))}
                            required
                          />
                          {choice}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      value={answers[q.question_no] || ""}
                      onChange={(e) => setAnswers((v) => ({ ...v, [q.question_no]: e.target.value }))}
                      placeholder="Nhập câu trả lời..."
                      required
                    />
                  )}
                </div>
              ))}
            </div>

            <button type="submit" className="button primary wide" disabled={submitting}>
              {submitting ? "Đang nộp bài..." : "Nộp bài"}
            </button>
            <p className="pbt-note">Lưu ý: chỉ được nộp 1 lần, không thể làm lại hay sửa sau khi nộp.</p>
          </form>
        ) : null}

        {result ? (
          <div className="pbt-result">
            <h1>Đã nộp bài thành công</h1>
            <div className="pbt-score">
              {result.score}
              {result.scoreMax ? `/${result.scoreMax}` : ""}
            </div>
            <p className="muted">
              Đúng {result.correctCount}/{result.total} câu
            </p>
            <ul className="pbt-answer-list">
              {result.perQuestion.map((r, idx) => (
                <li key={r.question_no} className={r.is_correct ? "is-correct" : "is-wrong"}>
                  Câu {idx + 1}: {r.is_correct ? "Đúng" : "Sai"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .pbt-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 24px 16px;
        }
        .pbt-card {
          width: min(560px, 100%);
          background: #fff;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 26px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pbt-brand {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--brand);
        }
        .pbt-form,
        .pbt-closed,
        .pbt-result {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pbt-form h1,
        .pbt-closed h1,
        .pbt-result h1 {
          margin: 0;
          font-size: 20px;
        }
        .pbt-questions {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pbt-question {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pbt-question strong {
          font-size: 13px;
          line-height: 1.4;
        }
        .pbt-note {
          margin: 0;
          font-size: 11px;
          color: var(--muted);
          text-align: center;
        }
        .pbt-score {
          font-size: 44px;
          font-weight: 800;
          color: var(--brand);
        }
        .pbt-answer-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        }
        .pbt-answer-list .is-correct {
          color: var(--success);
        }
        .pbt-answer-list .is-wrong {
          color: var(--danger);
        }
      `}</style>
    </main>
  );
}
