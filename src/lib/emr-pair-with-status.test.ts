import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for explicit user feedback: "giai đoạn triển khai và trạng
// thái triển khai đang giống nhau... nếu cần sao ko để cùng nhau?" — both
// fields are kept (they track different things: the generic cross-category
// rollout status vs. Biểu mẫu's own Demo/UAT/Production lifecycle stage) but
// deployment_phase is now rendered immediately next to the generic "Trạng
// thái triển khai" select in the modal instead of being scattered earlier
// among the category's other fields, where the two looked like duplicates.
describe("EMR — pairWithStatus renders a field next to the generic status select", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares deployment_phase with pairWithStatus so it isn't confused with a duplicate of the generic status", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "deployment_phase");
    expect(field?.pairWithStatus).toBe(true);
  });

  it("excludes pairWithStatus fields from the normal top-to-bottom field loop", () => {
    expect(client).toContain('{extraFields.filter((f) => !f.pairWithStatus && !(categoryCode === "BIEU_MAU" && f.key === "record_types")).map((f) => (');
  });

  it("renders them directly after the Trạng thái triển khai select, not elsewhere in the modal", () => {
    const statusIdx = client.indexOf("<label>Trạng thái triển khai");
    const pairedIdx = client.indexOf("{extraFields.filter((f) => f.pairWithStatus).map((f) => (");
    const priorityIdx = client.indexOf("<label>Mức ưu tiên");
    expect(statusIdx).toBeGreaterThan(-1);
    expect(pairedIdx).toBeGreaterThan(statusIdx);
    expect(priorityIdx).toBeGreaterThan(pairedIdx);
  });
});
