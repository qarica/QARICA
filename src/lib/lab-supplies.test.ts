import { describe, expect, it } from "vitest";
import {
  daysUntilExpiry,
  formatQuantity,
  isIsoDate,
  itemStockStatus,
  lotExpiryStatus,
  parsePositiveQuantity,
  parseSignedQuantity,
  signedDelta,
  sortLotsFefo,
  todayInVietnam,
} from "./lab-supplies";

describe("lotExpiryStatus — cảnh báo hạn dùng theo cấu hình từng vật tư", () => {
  it("lô không có hạn dùng thì không cảnh báo", () => {
    expect(lotExpiryStatus(null, 30, "2026-11-29")).toBe("NO_EXPIRY");
  });
  it("còn đúng ngày hạn vẫn dùng được (khớp hàm SQL: chỉ chặn khi hạn < ngày phiếu)", () => {
    expect(daysUntilExpiry("2026-11-29", "2026-11-29")).toBe(0);
    expect(lotExpiryStatus("2026-11-29", 30, "2026-11-29")).toBe("EXPIRING");
  });
  it("quá hạn 1 ngày là hết hạn", () => {
    expect(lotExpiryStatus("2026-11-28", 30, "2026-11-29")).toBe("EXPIRED");
  });
  it("ngưỡng báo trước lấy theo từng vật tư, không hard-code", () => {
    expect(lotExpiryStatus("2026-12-20", 30, "2026-11-29")).toBe("EXPIRING");
    expect(lotExpiryStatus("2026-12-20", 7, "2026-11-29")).toBe("OK");
  });
});

describe("itemStockStatus — cảnh báo sắp hết theo định mức tối thiểu", () => {
  it("tồn <= 0 là hết hàng", () => {
    expect(itemStockStatus(0, 5)).toBe("OUT");
    expect(itemStockStatus(-1, 0)).toBe("OUT");
  });
  it("tồn <= định mức (định mức > 0) là sắp hết", () => {
    expect(itemStockStatus(5, 5)).toBe("LOW");
    expect(itemStockStatus(6, 5)).toBe("OK");
  });
  it("định mức 0 nghĩa là không cảnh báo sắp hết", () => {
    expect(itemStockStatus(1, 0)).toBe("OK");
  });
});

describe("sortLotsFefo", () => {
  it("hạn gần nhất xuất trước, lô không hạn xếp sau cùng", () => {
    const sorted = sortLotsFefo([
      { lot_number: "C", expiry_date: null },
      { lot_number: "B", expiry_date: "2027-03-01" },
      { lot_number: "A", expiry_date: "2026-12-01" },
    ]);
    expect(sorted.map((l) => l.lot_number)).toEqual(["A", "B", "C"]);
  });
});

describe("số lượng — chặn giá trị sai trước khi gọi RPC", () => {
  it("parsePositiveQuantity chỉ nhận số dương tối đa 3 chữ số thập phân", () => {
    expect(parsePositiveQuantity("12,5")).toBe(12.5);
    expect(parsePositiveQuantity("0")).toBeNull();
    expect(parsePositiveQuantity("-1")).toBeNull();
    expect(parsePositiveQuantity("1.2345")).toBeNull();
    expect(parsePositiveQuantity("abc")).toBeNull();
    expect(parsePositiveQuantity("")).toBeNull();
  });
  it("parseSignedQuantity nhận số âm nhưng không nhận 0", () => {
    expect(parseSignedQuantity("-3")).toBe(-3);
    expect(parseSignedQuantity("2.5")).toBe(2.5);
    expect(parseSignedQuantity("0")).toBeNull();
    expect(parseSignedQuantity("-0")).toBeNull();
  });
  it("signedDelta: nhập dương, xuất/hủy âm, điều chỉnh giữ dấu", () => {
    expect(signedDelta("RECEIPT", 5)).toBe(5);
    expect(signedDelta("ISSUE", 5)).toBe(-5);
    expect(signedDelta("DISPOSAL", 5)).toBe(-5);
    expect(signedDelta("ADJUST", -2)).toBe(-2);
    expect(signedDelta("ADJUST", 2)).toBe(2);
  });
  it("formatQuantity không lỗi với giá trị rỗng", () => {
    expect(formatQuantity(null)).toBe("0");
    expect(formatQuantity("1500")).toBe("1.500");
  });
});

describe("ngày", () => {
  it("isIsoDate chỉ nhận YYYY-MM-DD hợp lệ", () => {
    expect(isIsoDate("2026-11-29")).toBe(true);
    expect(isIsoDate("29/11/2026")).toBe(false);
    expect(isIsoDate("2026-13-40")).toBe(false);
  });
  it("todayInVietnam tính theo múi giờ Asia/Ho_Chi_Minh (UTC+7)", () => {
    expect(todayInVietnam(new Date("2026-11-29T18:00:00Z"))).toBe("2026-11-30");
    expect(todayInVietnam(new Date("2026-11-29T16:59:00Z"))).toBe("2026-11-29");
  });
});
