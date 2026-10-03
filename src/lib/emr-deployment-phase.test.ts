import { EMR_CATEGORY_FIELDS } from "./emr-categories";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: once a Biểu mẫu is digitized, it goes
// through Demo -> UAT -> Chạy chính thức (production). The user explicitly
// asked to keep the same restricted-input discipline QLCL uses elsewhere —
// a fixed list to pick from, never free text — so this reuses the existing
// generic "select" field type (already wired end-to-end: modal dropdown,
// table display, sanitizeDetails, Excel export) instead of a new field type
// or a free-text input.
describe("EMR Biểu mẫu — deployment_phase (Giai đoạn triển khai)", () => {
  it("declares deployment_phase as a constrained select with exactly the 3 requested phases, in order", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "deployment_phase");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("select");
    expect(field?.label).toBe("Giai đoạn triển khai");
    expect(field?.options).toEqual(["Demo", "UAT", "Chạy chính thức"]);
  });
});
