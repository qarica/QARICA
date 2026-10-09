import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for a requested feature: "các biểu mẫu có tick cần đào tạo
// chưa link tạo task bên menu đào tạo, chỉ cần xác nhận là approve đào
// tạo" — a form needing training only linked to the whole Đào tạo category
// page, forcing the trainer to re-type the form's name into a new entry.
// Fixed generically: Đào tạo declares a "reference" field back to Biểu mẫu
// (reusing the existing cross-category reference mechanism, not a new
// link type), and Biểu mẫu's training_required cell deep-links into Đào
// tạo's create modal with that reference pre-filled — or, once a linked
// Đào tạo item already exists, links straight to it so the trainer just
// approves/updates it instead of creating a duplicate.
describe("EMR — Cần đào tạo deep-links into a pre-filled Đào tạo item", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares DAO_TAO's related_form_id as a reference back to BIEU_MAU, the same mechanism Lỗi and Tài liệu hướng dẫn already use", () => {
    const field = EMR_CATEGORY_FIELDS.DAO_TAO.find((f) => f.key === "related_form_id");
    expect(field?.type).toBe("reference");
    expect(field?.referenceCategory).toBe("BIEU_MAU");
  });

  it("DAO_TAO is excluded from the generic incoming-references columns, since it is rendered specially in the training_required cell instead", () => {
    expect(client).toContain('const genericIncomingReferences = incomingReferences.filter((r) => r.category !== "DAO_TAO" && r.category !== "LOI");');
  });

  it("builds a create-with-prefill link carrying ref_field/ref_id/ref_title when no linked Đào tạo item exists yet", () => {
    expect(client).toContain('const trainingRef = incomingReferences.find((r) => r.category === "DAO_TAO");');
    expect(client).toContain('`/emr/dao-tao?ref_field=${trainingRef.field.key}&ref_id=${item.id}&ref_title=${encodeURIComponent(item.title)}`');
  });

  it("links straight to an existing linked Đào tạo item instead of creating a duplicate, once one exists", () => {
    expect(client).toContain("const existing = trainingRef ? (refItems.DAO_TAO || []).find((r) => r.details?.[trainingRef.field.key] === item.id) : null;");
    expect(client).toContain('{existing ? "Duyệt đào tạo →" : "Tạo nhiệm vụ đào tạo →"}');
  });

  it("Đào tạo's own page reads ref_field/ref_id from the URL and pre-fills+opens its create modal — a generic mechanism, not hardcoded to this one pair", () => {
    expect(client).toContain('const refField = params.get("ref_field");');
    expect(client).toContain('const refId = params.get("ref_id");');
    expect(client).toContain("extraFields.some((f) => f.key === refField)");
    expect(client).toContain('details: { ...emptyDetails(), [refField]: refId }');
  });

  it("cleans the ref_field/ref_id query params from the URL after consuming them, so refreshing doesn't re-open the prefilled modal", () => {
    expect(client).toContain('window.history.replaceState(null, "", window.location.pathname);');
  });
});
