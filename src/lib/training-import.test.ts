import { describe, expect, it } from "vitest";
import {
  applyAnswerKey,
  buildImportPlan,
  buildResponses,
  detectColumns,
  namesMatch,
  normalizeName,
  parseRows,
  scoreAnswers,
  type ExistingAttendee,
  type ScoredPersonRow,
} from "./training-import";

function row(partial: Partial<ScoredPersonRow> & Pick<ScoredPersonRow, "employeeName" | "roundLabel">): ScoredPersonRow {
  return {
    employeeCode: null,
    dept: null,
    title: null,
    score: null,
    rawAnswers: null,
    scoringSkipped: false,
    responses: null,
    ...partial,
  };
}

// Các case thật lấy từ báo cáo Pre/Post-test ATPT-HSBA (11/11/2026) — xem
// commit "Thêm điểm Pre/Post-test vào Quản lý đào tạo" và bản tổng quát hoá
// sang nhiều đợt kiểm tra (round) — "kỳ thi nào" — ở commit sau đó.
describe("normalizeName / namesMatch", () => {
  it("khớp bất kể hoa/thường và dấu tiếng Việt (Nguyen vs Nguyễn)", () => {
    expect(namesMatch("Nguyễn hoàng gia trúc", "Nguyen hoàng gia trúc")).toBe(true);
  });

  it("khớp bất kể hoa/thường toàn bộ (PHÙNG THỊ NGỌC CƠ vs Phùng Thị Ngọc Cơ)", () => {
    expect(namesMatch("Phùng Thị Ngọc Cơ", "PHÙNG THỊ NGỌC CƠ")).toBe(true);
  });

  it("khớp sau khi bỏ tiền tố học hàm/chức danh (Bs Bùi Thường Hương Thy vs Bùi Thường Hương Thy)", () => {
    expect(namesMatch("Bùi Thường Hương Thy", "Bs Bùi Thường Hương Thy")).toBe(true);
  });

  it("không khớp 2 người khác nhau", () => {
    expect(namesMatch("Trần Trường Vinh", "Trần Thị Tuyết")).toBe(false);
  });

  it("chuỗi rỗng không bao giờ khớp", () => {
    expect(namesMatch("", "")).toBe(false);
  });

  it("normalizeName gộp khoảng trắng thừa", () => {
    expect(normalizeName("  Lê   Thị   Tuyền ")).toBe("le thi tuyen");
  });
});

describe("scoreAnswers / buildResponses", () => {
  const answerKey = ["24 giờ và 36 giờ", "SOAP", "3 giai đoạn."];

  it("đếm đúng số câu khớp, không phân biệt hoa/thường và dấu câu cuối câu", () => {
    expect(scoreAnswers(["24 giờ và 36 giờ", "soap", "3 giai đoạn"], answerKey)).toBe(3);
  });

  it("câu sai không tính điểm", () => {
    expect(scoreAnswers(["24 giờ và 48 giờ", "ABCDE", "5 giai đoạn."], answerKey)).toBe(0);
  });

  it("chỉ so sánh trong phạm vi số câu ngắn hơn (không crash khi lệch số cột)", () => {
    expect(scoreAnswers(["24 giờ và 36 giờ"], answerKey)).toBe(1);
  });

  // "Muốn xem 1 người thì làm sao tra cứu ... sai câu nào đúng câu nào" —
  // buildResponses giữ lại câu trả lời gốc + đúng/sai từng câu, không chỉ
  // điểm tổng.
  it("buildResponses trả về đúng/sai + câu trả lời gốc cho từng câu", () => {
    const responses = buildResponses(["24 giờ và 48 giờ", "SOAP", "3 giai đoạn"], answerKey);
    expect(responses).toEqual([
      { questionNo: 1, answerText: "24 giờ và 48 giờ", isCorrect: false },
      { questionNo: 2, answerText: "SOAP", isCorrect: true },
      { questionNo: 3, answerText: "3 giai đoạn", isCorrect: true },
    ]);
  });
});

describe("detectColumns", () => {
  it("nhận diện đúng cột trong file khảo sát thô (Google/Microsoft Form) — câu hỏi suy ra từ số cột 'Câu N'", () => {
    const header = ["Id", "Thời gian bắt đầu", "Email", "Họ tên Thầy/Cô; Anh/Chị", "Mã nhân viên", "Đơn vị công tác", "Chức danh chuyên môn", "Câu 1. Abc?", "Câu 2. Xyz?"];
    const cols = detectColumns(header);
    expect(cols.nameIdx).toBe(3);
    expect(cols.codeIdx).toBe(4);
    expect(cols.deptIdx).toBe(5);
    expect(cols.titleIdx).toBe(6);
    expect(cols.questionIdxs).toEqual([7, 8]);
    expect(cols.scoreIdx).toBeNull();
  });

  it("nhận diện file đã chấm sẵn (có cột Điểm /17) — không cần đáp án vì điểm đã có sẵn", () => {
    const header = ["ID", "Nhóm", "Họ tên", "Mã NV", "Đơn vị", "Chức danh", "Điểm /17", "Tỷ lệ đúng"];
    const cols = detectColumns(header);
    expect(cols.groupIdx).toBe(1);
    expect(cols.nameIdx).toBe(2);
    expect(cols.scoreIdx).toBe(6);
    expect(cols.scoreMaxFromHeader).toBe(17);
    expect(cols.questionIdxs).toEqual([]);
  });

  // Lỗi thật gặp khi chạy thử với file khảo sát thô (downloadfile.xlsx):
  // Microsoft Form luôn có sẵn 1 cột "Tên" (định danh người trả lời, thường
  // để trống) ĐỨNG TRƯỚC cột tên thật "Họ tên Thầy/Cô; Anh/Chị" — so khớp
  // "tên" (bare) chọn nhầm cột rỗng đứng trước, mọi dòng bị loại vì "thiếu
  // tên". Phải ưu tiên "họ tên" trước, chỉ fallback "tên" khi không có.
  it("không chọn nhầm cột 'Tên' rỗng đứng trước cột 'Họ tên...' thật", () => {
    const header = ["Id", "Email", "Tên", "Họ tên Thầy/Cô; Anh/Chị", "Mã nhân viên"];
    const cols = detectColumns(header);
    expect(cols.nameIdx).toBe(3);
  });

  // Lỗi thật thứ 2: câu hỏi dài có thể vô tình chứa đúng từ khoá của cột
  // khác ("Ba thời ĐIỂM thực hiện bảng kiểm..." chứa chữ "điểm" nhưng không
  // phải cột điểm số) — so khớp "includes" ở bất kỳ đâu trong câu sẽ chọn
  // nhầm cột câu hỏi làm cột Điểm, làm hỏng toàn bộ việc chấm điểm (mọi
  // điểm ra null). Phải so khớp từ ĐẦU tiêu đề, và câu hỏi ("Câu N...")
  // luôn được phân loại trước, tách biệt hẳn khỏi các hint khác.
  it("không nhầm câu hỏi chứa chữ 'điểm'/'đơn vị' giữa câu thành cột Điểm/Đơn vị", () => {
    const header = [
      "Họ tên",
      "Câu 10. Ba thời điểm thực hiện bảng kiểm an toàn phẫu thuật theo WHO là gì?",
      "Câu 11. Đơn vị tính nào được dùng để đo liều lượng thuốc?",
    ];
    const cols = detectColumns(header);
    expect(cols.scoreIdx).toBeNull();
    expect(cols.deptIdx).toBeNull();
    expect(cols.questionIdxs).toEqual([1, 2]);
  });
});

describe("parseRows", () => {
  it("bỏ qua mã NV gõ nhầm thành chữ có dấu/khoảng trắng (không phải mã thật)", () => {
    const header = ["Nhóm", "Họ tên", "Mã NV", "Điểm /17"];
    const cols = detectColumns(header);
    const rows = parseRows(
      [
        ["Pre-test", "HÁN VĂN HƯNG", "Hán văn hưng", 17],
        ["Pre-test", "Trần Trường Vinh", "12345", 16],
      ],
      cols,
    );
    expect(rows[0].employeeCode).toBeNull();
    expect(rows[1].employeeCode).toBe("12345");
  });

  it("đọc đúng tên đợt (roundLabel) lấy thẳng từ cột Nhóm, không giới hạn Pre/Post — hỗ trợ 'kỳ thi nào'", () => {
    const header = ["Nhóm", "Họ tên", "Điểm /17"];
    const cols = detectColumns(header);
    const rows = parseRows(
      [
        ["Kiểm tra định kỳ T3/2027", "Phạm Xuân Hậu", 17],
        ["", "", ""],
      ],
      cols,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roundLabel).toBe("Kiểm tra định kỳ T3/2027");
  });

  // File khảo sát thô thường KHÔNG có cột Nhóm (mỗi lần chỉ xuất 1 đợt Pre
  // HOẶC Post riêng, không gộp chung như báo cáo đã chấm sẵn) — người dùng
  // tự chọn/đặt tên đợt trước khi xem trước, không đoán bừa là Pre-test.
  it("dùng defaultRoundLabel khi file không có cột Nhóm", () => {
    const header = ["Họ tên", "Câu 1. Abc?"];
    const cols = detectColumns(header);
    const rows = parseRows([["Nguyễn Văn A", "đáp án"]], cols, "Post-test");
    expect(rows[0].roundLabel).toBe("Post-test");
  });
});

describe("applyAnswerKey", () => {
  it("giữ nguyên điểm đã có sẵn trong file (không tính lại)", () => {
    const rows = applyAnswerKey([row({ employeeName: "A", roundLabel: "Pre-test", score: 15 })], ["x"]);
    expect(rows[0].score).toBe(15);
    expect(rows[0].scoringSkipped).toBe(false);
    expect(rows[0].responses).toBeNull();
  });

  it("tự chấm điểm từ câu trả lời thô khi có đáp án, kèm chi tiết đúng/sai từng câu", () => {
    const rows = applyAnswerKey([row({ employeeName: "A", roundLabel: "Pre-test", rawAnswers: ["SOAP", "sai"] })], ["SOAP", "đúng"]);
    expect(rows[0].score).toBe(1);
    expect(rows[0].responses).toEqual([
      { questionNo: 1, answerText: "SOAP", isCorrect: true },
      { questionNo: 2, answerText: "sai", isCorrect: false },
    ]);
  });

  it("đánh dấu scoringSkipped khi có câu trả lời thô nhưng chưa khai báo đáp án", () => {
    const rows = applyAnswerKey([row({ employeeName: "A", roundLabel: "Pre-test", rawAnswers: ["SOAP"] })], null);
    expect(rows[0].score).toBeNull();
    expect(rows[0].scoringSkipped).toBe(true);
  });
});

describe("buildImportPlan", () => {
  it("ghép 2 dòng cùng tên khác đợt (Pre/Post) thành 1 insert duy nhất với 2 kết quả", () => {
    const actions = buildImportPlan(
      [
        row({ employeeName: "Lê Thị Tuyền", dept: "PTGMHS", title: "ĐD", roundLabel: "Pre-test", score: 15 }),
        row({ employeeName: "Lê Thị Tuyền", dept: "PTGMHS", title: "ĐD", roundLabel: "Post-test", score: 17 }),
      ],
      [],
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("insert");
    expect(actions[0].results).toEqual(
      expect.arrayContaining([
        { roundLabel: "Pre-test", score: 15, conflict: false, responses: null },
        { roundLabel: "Post-test", score: 17, conflict: false, responses: null },
      ]),
    );
  });

  // Tổng quát hoá: không chỉ 2 đợt Pre/Post — 1 người có thể xuất hiện ở 3
  // đợt kiểm tra khác nhau trong cùng 1 file, vẫn ghép thành 1 người với 3
  // kết quả.
  it("ghép được nhiều hơn 2 đợt kiểm tra cho cùng 1 người (không giới hạn Pre/Post)", () => {
    const actions = buildImportPlan(
      [
        row({ employeeName: "Trần Trường Vinh", roundLabel: "Pre-test", score: 16 }),
        row({ employeeName: "Trần Trường Vinh", roundLabel: "Post-test", score: 17 }),
        row({ employeeName: "Trần Trường Vinh", roundLabel: "Kiểm tra định kỳ T3/2027", score: 15 }),
      ],
      [],
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].results.map((r) => r.roundLabel).sort()).toEqual(["Kiểm tra định kỳ T3/2027", "Post-test", "Pre-test"]);
  });

  it("không ghép khi mã NV mâu thuẫn dù tên giống nhau", () => {
    const actions = buildImportPlan(
      [
        row({ employeeName: "ABC", employeeCode: "123", roundLabel: "Pre-test", score: 17 }),
        row({ employeeName: "ABC", employeeCode: "999", roundLabel: "Post-test", score: 16 }),
      ],
      [],
    );
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.type === "insert")).toBe(true);
  });

  it("cập nhật người đã có sẵn trong roster (import Post-test sau, Pre-test đã nhập từ trước)", () => {
    const existing: ExistingAttendee[] = [{ id: "att-1", employeeName: "Phạm Xuân Hậu", employeeCode: "11054", resultsByRound: { "Pre-test": 15 } }];
    const actions = buildImportPlan([row({ employeeName: "Phạm Xuân Hậu", employeeCode: "11054", roundLabel: "Post-test", score: 17 })], existing);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "update", attendeeId: "att-1" });
    expect(actions[0].results).toEqual([{ roundLabel: "Post-test", score: 17, conflict: false, responses: null }]);
  });

  it("đánh dấu conflict khi điểm mới khác điểm cũ đã có cho cùng 1 đợt, nhưng vẫn trả về điểm mới để người dùng tự quyết", () => {
    const existing: ExistingAttendee[] = [{ id: "att-1", employeeName: "Phạm Xuân Hậu", employeeCode: null, resultsByRound: { "Post-test": 10 } }];
    const actions = buildImportPlan([row({ employeeName: "Phạm Xuân Hậu", roundLabel: "Post-test", score: 17 })], existing);
    expect(actions[0].results).toEqual([{ roundLabel: "Post-test", score: 17, conflict: true, responses: null }]);
  });

  it("còn dư Pre-only và Post-only khi không ghép được — không ép ghép sai", () => {
    const actions = buildImportPlan(
      [
        row({ employeeName: "Trần Trường Vinh", roundLabel: "Pre-test", score: 16 }),
        row({ employeeName: "Lý Hoàng Thanh Trúc", roundLabel: "Post-test", score: 17 }),
      ],
      [],
    );
    expect(actions).toHaveLength(2);
    const byName = Object.fromEntries(actions.map((a) => [a.employeeName, a]));
    expect(byName["Trần Trường Vinh"].results).toEqual([{ roundLabel: "Pre-test", score: 16, conflict: false, responses: null }]);
    expect(byName["Lý Hoàng Thanh Trúc"].results).toEqual([{ roundLabel: "Post-test", score: 17, conflict: false, responses: null }]);
  });
});
