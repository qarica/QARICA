import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for a requested feature: "Bổ sung chỗ gáy biểu mẫu sẽ có tick
// theo loại hồ sơ khám bệnh, ngoại trú, cấp cứu, nội trú, điều trị ban ngày
// theo từng biểu mẫu" — a form can apply to several record types at once, so
// it's a tick-list (multiselect), reusing the exact same mechanism as
// target_roles/storage_format rather than a new field type. Kept `compact`
// so it doesn't reopen the "too many columns" complaint the grid declutter
// pass just fixed.
//
// "Điều trị ban ngày" sau đó được yêu cầu gộp chung vào "Ngoại trú" (không
// đóng gáy riêng) — còn lại 4 loại hồ sơ.
describe("EMR Biểu mẫu — Loại hồ sơ áp dụng (record_types tick-list)", () => {
  it("is a multiselect with the 4 record types (Điều trị ban ngày đã gộp vào Ngoại trú), compact (detail panel, not a grid column)", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "record_types");
    expect(field?.type).toBe("multiselect");
    expect(field?.compact).toBe(true);
    expect(field?.options).toEqual(["Khám bệnh", "Ngoại trú", "Cấp cứu", "Nội trú"]);
  });
});
