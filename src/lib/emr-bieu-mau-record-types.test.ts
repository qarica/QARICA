import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for a requested feature: "Bổ sung chỗ gáy biểu mẫu sẽ có tick
// theo loại hồ sơ khám bệnh, ngoại trú, cấp cứu, nội trú, điều trị ban ngày
// theo từng biểu mẫu" — a form can apply to several record types at once, so
// it's a tick-list (multiselect), reusing the exact same mechanism as
// target_roles/storage_format rather than a new field type. Kept `compact`
// so it doesn't reopen the "too many columns" complaint the grid declutter
// pass just fixed.
describe("EMR Biểu mẫu — Loại hồ sơ áp dụng (record_types tick-list)", () => {
  it("is a multiselect with the 5 requested record types, compact (detail panel, not a grid column)", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "record_types");
    expect(field?.type).toBe("multiselect");
    expect(field?.compact).toBe(true);
    expect(field?.options).toEqual(["Khám bệnh", "Ngoại trú", "Cấp cứu", "Nội trú", "Điều trị ban ngày"]);
  });
});
