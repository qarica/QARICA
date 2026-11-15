import { describe, expect, it } from "vitest";
import { computeScore, gradeAnswers, normalizeEmployeeCode } from "./training-self-test";

describe("normalizeEmployeeCode: dùng làm khoá chống nộp trùng theo mã NV", () => {
  it("trim, gộp khoảng trắng, viết hoa", () => {
    expect(normalizeEmployeeCode("  nv  001 ")).toBe("NV 001");
    expect(normalizeEmployeeCode("nv001")).toBe("NV001");
  });
});

describe("gradeAnswers: so khớp không phân biệt hoa/thường và khoảng trắng thừa", () => {
  it("đúng khi khớp sau khi chuẩn hoá", () => {
    const result = gradeAnswers([{ question_no: 1, correct_answer: "  SOAP  " }], [{ question_no: 1, answer_text: "soap" }]);
    expect(result).toEqual([{ question_no: 1, answer_text: "soap", is_correct: true }]);
  });

  it("sai khi không khớp", () => {
    const result = gradeAnswers([{ question_no: 1, correct_answer: "SOAP" }], [{ question_no: 1, answer_text: "APIE" }]);
    expect(result[0].is_correct).toBe(false);
  });

  it("câu không trả lời (thiếu trong mảng answers) tính là sai, không ném lỗi", () => {
    const result = gradeAnswers([{ question_no: 1, correct_answer: "SOAP" }], []);
    expect(result).toEqual([{ question_no: 1, answer_text: "", is_correct: false }]);
  });
});

describe("computeScore", () => {
  it("không có scoreMax: trả số câu đúng thô", () => {
    const responses = [
      { question_no: 1, answer_text: "a", is_correct: true },
      { question_no: 2, answer_text: "b", is_correct: false },
    ];
    expect(computeScore(responses, null)).toBe(1);
  });

  it("có scoreMax: quy đổi theo tỉ lệ đúng/tổng", () => {
    const responses = [
      { question_no: 1, answer_text: "a", is_correct: true },
      { question_no: 2, answer_text: "b", is_correct: true },
      { question_no: 3, answer_text: "c", is_correct: false },
      { question_no: 4, answer_text: "d", is_correct: false },
    ];
    expect(computeScore(responses, 10)).toBe(5);
  });

  it("không có câu nào: trả 0 thay vì chia cho 0", () => {
    expect(computeScore([], 10)).toBe(0);
  });
});
