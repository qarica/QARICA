import { describe, expect, it } from "vitest";
import { humanStatus } from "./format";

describe("humanStatus: OPEN", () => {
  it("dịch OPEN sang 'Đang mở' (việc cá nhân đang mở ở Việc của tôi, cả bảng lẫn Excel dùng chung hàm này)", () => {
    expect(humanStatus("OPEN")).toBe("Đang mở");
  });
  it("dịch TODO sang 'Chưa thực hiện' (hạng mục EMR chưa làm ở Việc của tôi, bảng lẫn Excel)", () => {
    expect(humanStatus("TODO")).toBe("Chưa thực hiện");
  });
  it("các trạng thái khác giữ nguyên", () => {
    expect(humanStatus("COMPLETED")).toBe("Hoàn thành");
    expect(humanStatus("OVERDUE")).toBe("Quá hạn");
    expect(humanStatus(null)).toBe("—");
  });
});
