import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORIES, EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for two new Biểu mẫu (BIEU_MAU) fields requested by the user:
// - "Đối tượng thực hiện" (target_roles): which roles perform/use this form,
//   a genuine multi-select (a form can involve several roles at once), so it
//   needs its own "multiselect" field type — reusing "select" would only
//   allow one role per form.
// - "Nhóm gáy" (binding_group): which physical binder/chapter group this
//   form files into. Left as free text (no fixed option list was given) so
//   this doesn't hard-code one hospital's binding scheme as if it were
//   universal business structure.
//
// Per CLAUDE.md's 3-layer discipline: a field in the form doesn't mean the
// API processes it. EMR_CATEGORY_FIELDS is read generically by both the
// create form (emr-category-client.tsx) and sanitizeDetails() in both
// POST (items/route.ts) and PATCH (items/[id]/route.ts), and the `details`
// column is already in every SELECT — so declaring the field here is both
// necessary AND (for a plain text/multiselect-as-string field) sufficient
// for the full chain to work, as long as the UI actually renders the type.
describe("EMR Biểu mẫu — target_roles and binding_group fields", () => {
  const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares target_roles as a multiselect with the requested role options", () => {
    const field = fields.find((f) => f.key === "target_roles");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("multiselect");
    expect(field?.label).toBe("Đối tượng thực hiện");
    for (const role of ["Bác sĩ", "Điều dưỡng", "NB/NNNB", "Kế toán", "CSKH", "Giám đốc chuyên môn", "Trưởng khoa", "Kỹ thuật viên", "Khác"]) {
      expect(field?.options).toContain(role);
    }
  });

  it("declares binding_group as a plain text field (no invented option list)", () => {
    const field = fields.find((f) => f.key === "binding_group");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("text");
    expect(field?.label).toBe("Nhóm gáy");
    expect(field?.options).toBeUndefined();
  });

  it("renders a checkbox group (not a single-choice select) for multiselect fields in the create/edit modal", () => {
    expect(client).toContain('f.type === "multiselect"');
    expect(client).toContain("<fieldset key={f.key}>");
    expect(client).toContain('className="check-grid emr-role-check-grid"');
    expect(client).toContain('className="check-card emr-role-check-card"');
  });

  it("stores and re-parses the selected roles as a comma-separated string in details, consistent with the generic string-based sanitizeDetails() on the server", () => {
    expect(client).toMatch(/selected\.includes\(o\)/);
    expect(client).toContain('next.join(", ")');
    // re-parsing on load/open must split the same way it was joined
    expect(client).toContain('.split(",").map((s) => s.trim()).filter(Boolean)');
  });

  it("sanitizeDetails on both the create (POST) and update (PATCH) routes handles the new fields generically — no special-casing needed since neither is type \"number\"", () => {
    const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain("function sanitizeDetails(category: string, raw: unknown)");
      expect(route).toContain('if (f.type === "number")');
      expect(route).toContain("out[f.key] = String(value).trim();");
    }
  });

  // signing_sequence was initially free text; the user explicitly rejected
  // that ("ko nhập freetexxt nhé") and asked for an ordered role picker
  // instead — see emr-signing-sequence.test.ts for the full regression.
  it("declares signing_sequence (Trình tự ký) as an ordered 'sequence' field, not free text", () => {
    const field = fields.find((f) => f.key === "signing_sequence");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("sequence");
    expect(field?.label).toBe("Trình tự ký");
  });

  it("declares notes (Ghi chú) as a textarea, distinct from the relabeled description field", () => {
    const field = fields.find((f) => f.key === "notes");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("textarea");
    expect(field?.label).toBe("Ghi chú");
  });

  it("renders a <textarea> (not a single-line input) for textarea-type fields in the create/edit modal", () => {
    expect(client).toContain('f.type === "textarea"');
    expect(client).toMatch(/f\.type === "textarea" \? \(\s*<textarea/);
  });

  it("overrides the generic 'Mô tả' label to 'Nguồn tham chiếu' for Biểu mẫu only, without touching the shared description column or other categories", () => {
    const bieuMau = EMR_CATEGORIES.find((c) => c.code === "BIEU_MAU");
    expect(bieuMau?.descriptionLabel).toBe("Nguồn tham chiếu");
    // every other category must NOT have a descriptionLabel override — this is
    // a per-category exception, not a renamed shared column/label
    for (const c of EMR_CATEGORIES) {
      if (c.code !== "BIEU_MAU") expect(c.descriptionLabel).toBeUndefined();
    }
    expect(client).toContain('descriptionLabel?: string');
    expect(client).toContain('const descLabel = descriptionLabel || "Mô tả";');
    expect(client).toContain("<th>{descLabel}</th>");
    expect(client).toContain("<label>{descLabel}");
    const page = readFileSync("src/app/(app)/emr/[category]/page.tsx", "utf8");
    expect(page).toContain("descriptionLabel={category.descriptionLabel}");
  });

  it("declares execution_platform (Nơi thực hiện) as free text, not a fixed dropdown — the user explicitly asked to self-declare the source (HIS, Web, …)", () => {
    const field = fields.find((f) => f.key === "execution_platform");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("text");
    expect(field?.label).toBe("Nơi thực hiện");
    expect(field?.options).toBeUndefined();
  });

  it("links a 'Cần đào tạo' training_required value across to the Đào tạo category, in both the table row (via fieldDisplayContent) and the edit modal", () => {
    expect(client).toContain('if (f.key === "training_required" && value === "Cần đào tạo")');
    expect(client).toContain('f.key==="training_required" && form.details[f.key]==="Cần đào tạo"');
    expect(client).toContain('const href = existing ? "/emr/dao-tao" :');
    expect(client).toContain('href="/emr/dao-tao">Xem danh mục Đào tạo →</Link>');
  });
});
