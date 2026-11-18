import { describe, expect, it } from "vitest";
import { baseClassCode, classCodeSequence, nextClassCodes } from "./procedure-training-class-code";

describe("baseClassCode / classCodeSequence", () => {
  it("tách đúng mã gốc và số thứ tự khi mã có dạng <gốc>.<số>", () => {
    expect(baseClassCode("ATPT.2")).toBe("ATPT");
    expect(classCodeSequence("ATPT.2")).toBe(2);
  });

  it("mã chưa có số thứ tự thì trả về nguyên mã / sequence null", () => {
    expect(baseClassCode("ATPT")).toBe("ATPT");
    expect(classCodeSequence("ATPT")).toBeNull();
  });
});

describe("nextClassCodes: báo cáo thực tế 'chưa có mã hoá lớp đào tạo, cùng chủ đề thì cùng mã lớp nhưng .1/.2/.n'", () => {
  it("lớp nguồn chưa có số thứ tự: gắn .1 cho lớp nguồn, lớp mới là .2", () => {
    const result = nextClassCodes("ATPT", ["ATPT"]);
    expect(result).toEqual({ sourceCode: "ATPT.1", newCode: "ATPT.2" });
  });

  it("lớp nguồn đã có số thứ tự rồi (nhân bản từ 1 lớp không phải lớp đầu): không sửa mã lớp nguồn, lớp mới lấy số tiếp theo", () => {
    const result = nextClassCodes("ATPT.2", ["ATPT.1", "ATPT.2"]);
    expect(result).toEqual({ sourceCode: null, newCode: "ATPT.3" });
  });

  it("nhân bản lần thứ 3 trong cùng chủ đề vẫn tính đúng số tiếp theo dù trùng thứ tự nhân bản", () => {
    const result = nextClassCodes("ATPT.1", ["ATPT.1", "ATPT.2", "ATPT.3"]);
    expect(result).toEqual({ sourceCode: null, newCode: "ATPT.4" });
  });
});
