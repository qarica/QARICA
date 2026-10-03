import { EMR_CATEGORIES } from "./emr-categories";

import { describe, expect, it } from "vitest";

// Regression for an explicit user-requested menu reorder: "Tổng quan EMR ->
// Quy trình -> Biểu mẫu -> Lỗi -> Đào tạo -> Patient Portal -> Chữ ký số ->
// Thiết bị CNTT -> Trang thiết bị y tế". Tổng quan EMR itself is not an
// EMR_CATEGORIES entry (it's the fixed first destination in the nav strip),
// so this only needs to assert the order of the real categories; both the
// workspace nav strip and the dashboard readiness grid derive their order
// directly from this same array (no separate hardcoded order to drift).
// Tài liệu hướng dẫn was added afterwards, first appended at the end, then
// explicitly moved to right after Đào tạo per a follow-up request ("menu tào
// liệu hướng dẫn sau menu đào tạo").
describe("EMR — category order matches the requested menu layout", () => {
  it("lists categories in the exact requested order, with Tài liệu hướng dẫn right after Đào tạo", () => {
    expect(EMR_CATEGORIES.map((c) => c.code)).toEqual([
      "QUY_TRINH",
      "BIEU_MAU",
      "LOI",
      "DAO_TAO",
      "TAI_LIEU_HUONG_DAN",
      "PATIENT_PORTAL",
      "CHU_KY_SO",
      "THIET_BI_CNTT",
      "THIET_BI_YTE",
    ]);
  });
});
