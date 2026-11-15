"use client";

import { use, useEffect, useState } from "react";

type Question = { question_no: number; question_text: string; choices: string[] | null };
type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "closed"; trainingName: string; roundLabel: string }
  | { kind: "open"; trainingName: string; roundLabel: string; scoreMax: number | null; questions: Question[] };
type DetailedAnswer = { question_no: number; question_text: string; choices: string[] | null; answer_text: string | null; is_correct: boolean };
type SubmitResult = { score: number; scoreMax: number | null; total: number; correctCount: number; perQuestion: DetailedAnswer[] };
type LookupResult = { employeeName: string; roundLabel: string; submittedAt: string } & SubmitResult;

export default function PublicTrainingTestPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  // "Xem lại bài đã làm" — nhân viên không có tài khoản nên không đăng nhập
  // lại tra cứu được, chỉ tự nhận diện lại bằng mã NV (như lúc nộp bài) khi
  // họ thắc mắc về điểm/đáp án đã chọn. Hoạt động được cả khi đợt đã ĐÓNG
  // (khác điều kiện nộp bài mới) vì thường tra lại sau khi buổi đã kết thúc.
  const [showLookup, setShowLookup] = useState(false);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  async function lookup() {
    setLookupError("");
    setLookupResult(null);
    setLookupBusy(true);
    const res = await fetch(`/api/public/training-test/${roundId}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_code: lookupCode }),
    });
    const body = await res.json().catch(() => ({}));
    setLookupBusy(false);
    if (!res.ok) {
      setLookupError(body.error || "Không tra cứu được, vui lòng thử lại.");
      return;
    }
    if (!body.found) {
      setLookupError("Không tìm thấy bài làm với mã nhân viên này trong đợt kiểm tra này.");
      return;
    }
    setLookupResult(body as LookupResult);
  }

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

        {state.kind === "closed" && !showLookup ? (
          <div className="pbt-closed">
            <h1>{state.trainingName}</h1>
            <p className="muted">{state.roundLabel}</p>
            <div className="alert error">Đợt kiểm tra này hiện chưa mở để làm bài. Vui lòng chờ cán bộ phụ trách mở trước khi quét lại.</div>
            <button type="button" className="link-button" onClick={() => setShowLookup(true)}>
              Đã làm bài đợt này rồi? Xem lại kết quả →
            </button>
          </div>
        ) : null}

        {state.kind === "open" && !result && !showLookup ? (
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
            <button type="button" className="link-button" onClick={() => setShowLookup(true)}>
              Đã làm bài đợt này rồi? Xem lại kết quả →
            </button>
          </form>
        ) : null}

        {result && !showLookup ? (
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
                  <strong>
                    Câu {idx + 1}. {r.question_text}
                  </strong>
                  {r.choices ? (
                    <ul className="pbt-choice-review">
                      {r.choices.map((choice) => (
                        <li key={choice} className={choice === r.answer_text ? (r.is_correct ? "chosen is-correct" : "chosen is-wrong") : ""}>
                          {choice}
                          {choice === r.answer_text ? (r.is_correct ? " — bạn đã chọn (Đúng)" : " — bạn đã chọn (Sai)") : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>
                      Bạn chọn: {r.answer_text || "(không trả lời)"} — {r.is_correct ? "Đúng" : "Sai"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="pbt-note">Không hiển thị đáp án đúng ở đây để tránh lộ đề cho người làm sau — nếu thắc mắc về câu sai, liên hệ cán bộ QLCL để đối chiếu.</p>
          </div>
        ) : null}

        {showLookup ? (
          <div className="pbt-lookup">
            <button type="button" className="link-button" onClick={() => setShowLookup(false)}>
              ← Quay lại
            </button>
            <h1>Xem lại bài đã làm</h1>
            <p className="muted">Nhập lại mã nhân viên đã dùng lúc nộp bài để xem chi tiết.</p>
            {lookupError ? <div className="alert error">{lookupError}</div> : null}
            {!lookupResult ? (
              <form
                className="pbt-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookup();
                }}
              >
                <label>
                  <span>Mã nhân viên *</span>
                  <input value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} required placeholder="NV0012" />
                </label>
                <button type="submit" className="button primary wide" disabled={lookupBusy}>
                  {lookupBusy ? "Đang tra cứu..." : "Tra cứu"}
                </button>
              </form>
            ) : (
              <>
                <p className="muted">
                  {lookupResult.employeeName} · {lookupResult.roundLabel} · nộp lúc {new Date(lookupResult.submittedAt).toLocaleString("vi-VN")}
                </p>
                <div className="pbt-score">
                  {lookupResult.score}
                  {lookupResult.scoreMax ? `/${lookupResult.scoreMax}` : ""}
                </div>
                <p className="muted">
                  Đúng {lookupResult.correctCount}/{lookupResult.total} câu
                </p>
                <ul className="pbt-answer-list">
                  {lookupResult.perQuestion.map((r, idx) => (
                    <li key={r.question_no} className={r.is_correct ? "is-correct" : "is-wrong"}>
                      <strong>
                        Câu {idx + 1}. {r.question_text}
                      </strong>
                      {r.choices ? (
                        <ul className="pbt-choice-review">
                          {r.choices.map((choice) => (
                            <li key={choice} className={choice === r.answer_text ? (r.is_correct ? "chosen is-correct" : "chosen is-wrong") : ""}>
                              {choice}
                              {choice === r.answer_text ? (r.is_correct ? " — đã chọn (Đúng)" : " — đã chọn (Sai)") : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>
                          Đã chọn: {r.answer_text || "(không trả lời)"} — {r.is_correct ? "Đúng" : "Sai"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="pbt-note">Không hiển thị đáp án đúng ở đây để tránh lộ đề cho người làm sau — nếu thắc mắc về câu sai, liên hệ cán bộ QLCL để đối chiếu.</p>
              </>
            )}
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
        .pbt-result,
        .pbt-lookup {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pbt-form h1,
        .pbt-closed h1,
        .pbt-result h1,
        .pbt-lookup h1 {
          margin: 0;
          font-size: 20px;
        }
        .pbt-closed .link-button,
        .pbt-form .link-button,
        .pbt-lookup > .link-button {
          align-self: flex-start;
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
          gap: 10px;
          font-size: 12px;
        }
        .pbt-answer-list li {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 10px;
          border-radius: 8px;
          background: #f8fafb;
        }
        .pbt-answer-list strong {
          font-size: 12px;
          line-height: 1.4;
        }
        .pbt-answer-list .is-correct span {
          color: var(--success);
        }
        .pbt-answer-list .is-wrong span {
          color: var(--danger);
        }
        .pbt-choice-review {
          list-style: none;
          margin: 4px 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pbt-choice-review li {
          padding: 5px 8px;
          border-radius: 6px;
          background: #fff;
          border: 1px solid var(--line);
        }
        .pbt-choice-review li.chosen.is-correct {
          background: var(--success-soft);
          border-color: transparent;
          color: var(--success);
          font-weight: 700;
        }
        .pbt-choice-review li.chosen.is-wrong {
          background: var(--danger-soft);
          border-color: transparent;
          color: var(--danger);
          font-weight: 700;
        }
      `}</style>
    </main>
  );
}
