import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Yêu cầu thực tế: "phân [loại] biểu mẫu còn thiếu ngày ban hành, quyết định
// ban hành và tình trạng sử dụng" — sau đó yêu cầu bỏ "quyết định ban hành"
// (không cần). Còn lại 2 field tham chiếu về ban hành/hiệu lực của biểu mẫu
// giấy, độc lập với digitized (tình trạng số hóa trong EMR) và
// status/deployment_phase (tiến độ triển khai EMR).
describe("EMR Biểu mẫu — issued_date, usage_status fields", () => {
  const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;

  it("declares issued_date (Ngày ban hành) as a date field", () => {
    const field = fields.find((f) => f.key === "issued_date");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("date");
    expect(field?.label).toBe("Ngày ban hành");
  });

  it("does not declare issuing_decision (Quyết định ban hành) — explicitly removed per user request", () => {
    expect(fields.find((f) => f.key === "issuing_decision")).toBeUndefined();
  });

  it("declares usage_status (Tình trạng sử dụng) as a select with Đang sử dụng/Ngưng sử dụng/Không thấy sử dụng/Cần xác minh", () => {
    const field = fields.find((f) => f.key === "usage_status");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("select");
    expect(field?.label).toBe("Tình trạng sử dụng");
    expect(field?.options).toEqual(["Đang sử dụng", "Ngưng sử dụng", "Không thấy sử dụng", "Cần xác minh"]);
  });

  it("is independent of digitized (tình trạng số hóa EMR) — neither field carries progressField/pairWithStatus", () => {
    for (const key of ["issued_date", "usage_status"]) {
      const field = fields.find((f) => f.key === key);
      expect(field?.progressField).toBeFalsy();
      expect(field?.pairWithStatus).toBeFalsy();
    }
  });

  // Per CLAUDE.md's 3-layer discipline: declaring the field here is both
  // necessary AND (for a plain text/date/select field) sufficient for the
  // full create/edit/table chain to work generically — same as every other
  // non-"number" BIEU_MAU field (see emr-bieu-mau-fields.test.ts).
  it("sanitizeDetails on both POST and PATCH routes handles the new fields generically (none is type \"number\")", () => {
    const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain("function sanitizeDetails(category: string, raw: unknown)");
      expect(route).toContain('if (f.type === "number")');
      expect(route).toContain("out[f.key] = String(value).trim();");
    }
  });
});
