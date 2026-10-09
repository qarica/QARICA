import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS, formatSequenceStep, formatSequenceValue, parseSequenceStep, sequenceSteps, SEQUENCE_SEPARATOR, SEQUENCE_STEP_METHOD_SEPARATOR } from "./emr-categories";

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
//
// Later requests refined this further: each step also picks a phương thức
// ký (Nhập liệu/Ký số/Ký điện tử/Vân tay/Đóng dấu — see
// parseSequenceStep/formatSequenceStep), and selecting "Khác" as the role
// now reveals a free-text input ("khác thì cho nhập text") — the ORIGINAL
// "no free text at all" rule only ever meant "don't make the whole role
// picker free text"; a bounded escape hatch for the one explicit "Khác"
// option is a different, later, explicit request.
//
// Further requests: "Chủ tọa" (presiding chair) added as a sequence-step
// role (meetings/minutes needing this role in the signing order), and
// "Ký điện tử/Vân tay" added as its OWN phương thức ký, distinct from plain
// "Vân tay" (biometric auth in general) and plain "Ký điện tử" (not
// necessarily biometric) — "bổ sung thêm chổ phương thức ký: 'ký điện
// tử/Vân tay' để phân biệt với ký điện tử".
describe("EMR Biểu mẫu — signing_sequence as an ordered role sequence", () => {
  const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares signing_sequence as type 'sequence', covering every target_roles option plus 'Đóng mộc' as a step-only option, plus the 3 clinical roles added later", () => {
    const signing = fields.find((f) => f.key === "signing_sequence");
    const targetRoles = fields.find((f) => f.key === "target_roles");
    expect(signing?.type).toBe("sequence");
    for (const role of targetRoles?.options ?? []) expect(signing?.options).toContain(role);
    expect(signing?.options).toContain("Đóng mộc");
    for (const role of ["Phẫu thuật viên", "BS GMHS", "Điều dưỡng trưởng", "Chủ tọa"]) expect(signing?.options).toContain(role);
    // "Đóng mộc" is a signing-flow step, not a performing role — it must
    // NOT leak into target_roles (Đối tượng thực hiện).
    expect(targetRoles?.options).not.toContain("Đóng mộc");
  });

  it("declares methodOptions (phương thức ký) for signing_sequence, including 'Ký điện tử/Vân tay' as distinct from plain 'Ký điện tử' and plain 'Vân tay'", () => {
    const signing = fields.find((f) => f.key === "signing_sequence");
    expect(signing?.methodOptions).toEqual(["Nhập liệu", "Ký số", "Ký điện tử", "Vân tay", "Ký điện tử/Vân tay", "Đóng dấu"]);
  });

  it("sequenceSteps()/formatSequenceValue() parse and render an ordered, numbered list — not a plain join", () => {
    const raw = ["Điều dưỡng", "Bác sĩ", "Trưởng khoa"].join(SEQUENCE_SEPARATOR);
    expect(sequenceSteps(raw)).toEqual(["Điều dưỡng", "Bác sĩ", "Trưởng khoa"]);
    expect(formatSequenceValue(raw)).toBe(`1. Điều dưỡng${SEQUENCE_SEPARATOR}2. Bác sĩ${SEQUENCE_SEPARATOR}3. Trưởng khoa`);
    expect(formatSequenceValue("")).toBe("—");
    expect(sequenceSteps(undefined)).toEqual([]);
  });

  it("parseSequenceStep()/formatSequenceStep() encode role+method in one step string, backward-compatible with plain-role data saved before this feature", () => {
    expect(parseSequenceStep("Bác sĩ")).toEqual({ role: "Bác sĩ", method: "" });
    expect(parseSequenceStep(`Bác sĩ${SEQUENCE_STEP_METHOD_SEPARATOR}Ký số`)).toEqual({ role: "Bác sĩ", method: "Ký số" });
    expect(formatSequenceStep("Bác sĩ", "")).toBe("Bác sĩ");
    expect(formatSequenceStep("Bác sĩ", "Ký số")).toBe(`Bác sĩ${SEQUENCE_STEP_METHOD_SEPARATOR}Ký số`);
  });

  it("formatSequenceValue() shows the method in parens next to the role when set, nothing extra when a step has no method (old data)", () => {
    const raw = [formatSequenceStep("Bác sĩ", "Ký số"), "Điều dưỡng"].join(SEQUENCE_SEPARATOR);
    expect(formatSequenceValue(raw)).toBe(`1. Bác sĩ (Ký số)${SEQUENCE_SEPARATOR}2. Điều dưỡng`);
  });

  it("renders a step-by-step picker in the create/edit modal: numbered rows, a role <select> per step, add/remove/reorder controls", () => {
    expect(client).toContain('f.type === "sequence"');
    expect(client).toContain('className="sequence-steps"');
    expect(client).toContain('className="sequence-step-row"');
    expect(client).toContain('className="sequence-step-no"');
    expect(client).toContain("+ Thêm bước ký");
    expect(client).toContain("Xoá bước");
  });

  it("renders a phương thức ký <select> per step when the field declares methodOptions", () => {
    expect(client).toContain("f.methodOptions ?");
    expect(client).toContain('aria-label="Phương thức ký"');
    expect(client).toContain("f.methodOptions.map((m) =>");
  });

  // "khác thì cho nhập text" — chọn "Khác" hiện ô nhập tự do, xử lý chung
  // cho mọi field "sequence" có option "Khác" (không hard-code riêng
  // signing_sequence), và vai trò đã lưu không khớp option nào (nhập tự do
  // từ trước) cũng tự nhận là đang ở chế độ "Khác" khi mở lại để sửa.
  it("selecting 'Khác' reveals a free-text input for the custom role, generic to any sequence field with a 'Khác' option", () => {
    expect(client).toContain('const hasCustomOption = (f.options || []).includes("Khác");');
    expect(client).toContain('const isKnownRole = role === "" || (f.options || []).includes(role);');
    expect(client).toContain('const selectValue = isKnownRole ? role : "Khác";');
    expect(client).toContain("const showCustomRoleInput = hasCustomOption && selectValue === \"Khác\";");
    expect(client).toContain('placeholder="Nhập vai trò..."');
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
