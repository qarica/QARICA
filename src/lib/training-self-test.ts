// Chấm điểm bài làm tự nộp qua QR (không đăng nhập) — logic thuần, không
// đụng DB, để test được độc lập với route công khai
// (/api/public/training-test/[roundId]).

export function normalizeEmployeeCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export type GradableQuestion = { question_no: number; correct_answer: string };
export type SubmittedAnswer = { question_no: number; answer_text: string };
export type GradedResponse = { question_no: number; answer_text: string; is_correct: boolean };

// So khớp không phân biệt hoa/thường, bỏ khoảng trắng thừa — người làm bài
// gõ tay nên không đòi hỏi trùng tuyệt đối từng ký tự.
function answersMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function gradeAnswers(questions: GradableQuestion[], answers: SubmittedAnswer[]): GradedResponse[] {
  const answerByQuestion = new Map(answers.map((a) => [a.question_no, a.answer_text]));
  return questions.map((q) => {
    const given = answerByQuestion.get(q.question_no) ?? "";
    return { question_no: q.question_no, answer_text: given, is_correct: given.length > 0 && answersMatch(given, q.correct_answer) };
  });
}

export function computeScore(responses: GradedResponse[], scoreMax: number | null): number {
  const total = responses.length;
  if (!total) return 0;
  const correctCount = responses.filter((r) => r.is_correct).length;
  if (scoreMax == null) return correctCount;
  return Math.round(((correctCount / total) * scoreMax) * 100) / 100;
}
