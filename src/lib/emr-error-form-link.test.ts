import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoriesReferencing, EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for a requested feature: Lỗi (LOI) items must be recordable
// multiple times, each tracked separately (already true — LOI is a plain
// list, no uniqueness constraint), with fix-progress tracked (already true
// via the shared status field), and explicitly linked to the specific
// Biểu mẫu they were filed against (new: a "reference" field type, generic
// enough for any category to point at any other category's live items,
// not hard-coded as a BIEU_MAU<->LOI special case in the component).
describe("EMR — Lỗi (LOI) links to the specific Biểu mẫu it was filed against", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares related_form_id on LOI as a reference field pointing at BIEU_MAU's live items", () => {
    const field = EMR_CATEGORY_FIELDS.LOI.find((f) => f.key === "related_form_id");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("reference");
    expect(field?.referenceCategory).toBe("BIEU_MAU");
    expect(field?.label).toBe("Biểu mẫu liên quan");
  });

  it("categoriesReferencing finds LOI as a reverse-reference source for BIEU_MAU, generically (not a hard-coded pair)", () => {
    const refs = categoriesReferencing("BIEU_MAU");
    expect(refs.some((r) => r.category === "LOI" && r.field.key === "related_form_id")).toBe(true);
    // a category with nothing pointing at it returns an empty list, not a crash
    expect(categoriesReferencing("THIET_BI_CNTT")).toEqual([]);
  });

  it("fetches the live items of every referenced/referencing category generically, keyed by category code", () => {
    expect(client).toContain("const referenceFields = extraFields.filter((f) => f.type === \"reference\" && f.referenceCategory);");
    expect(client).toContain("const incomingReferences = categoriesReferencing(categoryCode as EmrCategoryCode);");
    expect(client).toContain("referenceFields.map((f) => f.referenceCategory as string)");
    expect(client).toContain("incomingReferences.map((r) => r.category as string)");
  });

  it("renders a live-populated <select> for a reference field in the create/edit modal (not a static option list)", () => {
    expect(client).toContain('f.type === "reference" && f.referenceCategory ? (');
    expect(client).toContain("(refItems[f.referenceCategory] || []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)");
  });

  it("resolves a stored reference id to the target item's title (not a raw uuid) when displaying it in the table", () => {
    expect(client).toContain("const target = hasValue ? (refItems[f.referenceCategory]||[]).find((r)=>r.id===value) : null;");
    expect(client).toContain("{target ? <Link className=\"table-link\" href={`/emr/${slugForCode(f.referenceCategory)}`}>{target.title}</Link> : \"—\"}");
  });

  it("shows a reverse-link count (or a prompt to record one) on the referenced category's own table — e.g. Biểu mẫu shows how many Lỗi reference each row", () => {
    expect(client).toContain("incomingReferences.map((ref) => {");
    expect(client).toContain("r.details?.[ref.field.key]===item.id");
    expect(client).toContain(">Ghi nhận →</Link>");
  });
});
