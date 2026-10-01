import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS, formatSequenceValue, sequenceSteps, SEQUENCE_SEPARATOR } from "./emr-categories";

// Regression for an explicit user correction: "Trình tự ký" (signing order)
// was first implemented as a plain free-text field, then the user rejected
// that design ("ko nhập freetexxt nhé") and asked for a structured, ORDERED
// sequence of role picks — "1 chọn ai, 2 chọn ai, 3 chọn ai...", reusing the
// same role list already declared for "Đối tượng thực hiện" (target_roles)
// rather than inventing a second role list. A follow-up request also asked
// for a visible count of how many signatures are in the sequence, and a
// later one noted some forms also need an official stamp ("đóng mộc") as a
// step in the signing flow — added as an extra step option, NOT to
// target_roles, since stamping is an action/step, not a performing role.
describe("EMR Biểu mẫu — signing_sequence as an ordered role sequence", () => {
  const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares signing_sequence as type 'sequence', covering every target_roles option plus 'Đóng mộc' as a step-only option", () => {
    const signing = fields.find((f) => f.key === "signing_sequence");
    const targetRoles = fields.find((f) => f.key === "target_roles");
    expect(signing?.type).toBe("sequence");
    for (const role of targetRoles?.options ?? []) expect(signing?.options).toContain(role);
    expect(signing?.options).toContain("Đóng mộc");
    // "Đóng mộc" is a signing-flow step, not a performing role — it must
    // NOT leak into target_roles (Đối tượng thực hiện).
    expect(targetRoles?.options).not.toContain("Đóng mộc");
  });

  it("sequenceSteps()/formatSequenceValue() parse and render an ordered, numbered list — not a plain join", () => {
    const raw = ["Điều dưỡng", "Bác sĩ", "Trưởng khoa"].join(SEQUENCE_SEPARATOR);
    expect(sequenceSteps(raw)).toEqual(["Điều dưỡng", "Bác sĩ", "Trưởng khoa"]);
    expect(formatSequenceValue(raw)).toBe(`1. Điều dưỡng${SEQUENCE_SEPARATOR}2. Bác sĩ${SEQUENCE_SEPARATOR}3. Trưởng khoa`);
    expect(formatSequenceValue("")).toBe("—");
    expect(sequenceSteps(undefined)).toEqual([]);
  });

  it("renders a step-by-step picker in the create/edit modal: numbered rows, a role <select> per step (not free text), add/remove/reorder controls", () => {
    expect(client).toContain('f.type === "sequence"');
    expect(client).toContain('className="sequence-steps"');
    expect(client).toContain('className="sequence-step-row"');
    expect(client).toContain('className="sequence-step-no"');
    expect(client).toContain("+ Thêm bước ký");
    expect(client).toContain("Xoá bước");
    // no free-text <input> branch for this field type
    expect(client).not.toMatch(/f\.type === "sequence"[\s\S]{0,400}<input/);
  });

  it("shows a live signature count while editing, reusing sequenceSteps() rather than re-deriving the count ad hoc", () => {
    expect(client).toContain("const n = sequenceSteps(form.details[f.key]).length");
    expect(client).toContain("{n} chữ ký");
  });

  it("shows the same signature count in the read-only table column", () => {
    expect(client).toContain('f.type === "sequence"');
    expect(client).toContain("{steps.length} chữ ký");
    expect(client).toContain("formatSequenceValue(value)");
  });

  it("the server's generic sanitizeDetails() needs no special case for 'sequence' — it is stored as a trimmed string like every other non-number field", () => {
    const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    for (const route of [postRoute, patchRoute]) {
      expect(route).not.toMatch(/f\.type === "sequence"/);
    }
  });

  it("the Excel export formats sequence fields with formatSequenceValue() instead of the raw separator-joined string", () => {
    const exportRoute = readFileSync("src/app/api/emr/items/export/route.ts", "utf8");
    expect(exportRoute).toContain('if (f.type === "sequence") return formatSequenceValue(raw);');
  });
});
