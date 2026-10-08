import { describe, expect, it } from "vitest";
import { hcmDateKey, hcmMonthNumber } from "./hcm-date";

describe("HCM date helpers", () => {
  it("uses Asia/Ho_Chi_Minh at UTC month boundaries", () => {
    expect(hcmMonthNumber("2026-01-31T16:59:59Z")).toBe(1);
    expect(hcmMonthNumber("2026-01-31T17:00:00Z")).toBe(2);
    expect(hcmMonthNumber("2026-09-30T17:30:00Z")).toBe(10);
  });

  it("returns null for empty or invalid values", () => {
    expect(hcmMonthNumber(null)).toBeNull();
    expect(hcmMonthNumber("not-a-date")).toBeNull();
  });

  // Phát hiện từ "Việc sắp đến hạn" hiện sai ngày (07/10, 09/10) so với note
  // cá nhân thật (08/10, 10/10): personal-reminders.tsx lưu due_at bằng
  // new Date(`${due}T00:00:00`).toISOString() — nửa đêm giờ VN (UTC+7) quy
  // đổi ra UTC lùi về 17h hôm trước, nên chuỗi ISO trả về có NGÀY UTC lùi 1
  // ngày so với ngày người dùng thật sự chọn.
  it("hcmDateKey recovers the VN calendar date the user picked, even though the stored UTC date is one day earlier", () => {
    expect(hcmDateKey("2026-10-07T17:00:00.000Z")).toBe("2026-10-08");
    expect(hcmDateKey("2026-10-09T17:00:00.000Z")).toBe("2026-10-10");
  });

  it("a naive .slice(0,10) on the same values would wrongly return the UTC date, not the VN date", () => {
    expect("2026-10-07T17:00:00.000Z".slice(0, 10)).toBe("2026-10-07");
    expect(hcmDateKey("2026-10-07T17:00:00.000Z")).not.toBe("2026-10-07T17:00:00.000Z".slice(0, 10));
  });
});
