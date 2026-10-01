import { EMR_CATEGORIES } from "./emr-categories";

import { describe, expect, it } from "vitest";

// Regression for an explicit user-requested menu reorder: "Tổng quan EMR ->
// Quy trình -> Biểu mẫu -> Lỗi -> Đào tạo -> Patient Portal -> Chữ ký số ->
// Thiết bị CNTT -> Trang thiết bị y tế". Tổng quan EMR itself is not an
// EMR_CATEGORIES entry (it's the fixed first destination in the nav strip),
// so this only needs to assert the order of the real categories; both the
// workspace nav strip and the dashboard readiness grid derive their order
// directly from this same array (no separate hardcoded order to drift).
// Tài liệu hướng dẫn was added afterwards with no requested position, so it
// is appended at the end rather than disturbing the order above.
describe("EMR — category order matches the requested menu layout", () => {
  it("lists categories in the exact requested order, with later additions appended at the end", () => {
    expect(EMR_CATEGORIES.map((c) => c.code)).toEqual([
      "QUY_TRINH",
      "BIEU_MAU",
      "LOI",
      "DAO_TAO",
      "PATIENT_PORTAL",
      "CHU_KY_SO",
      "THIET_BI_CNTT",
      "THIET_BI_YTE",
      "TAI_LIEU_HUONG_DAN",
    ]);
  });
});
