import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS, formatBooleanValue } from "./emr-categories";

// Regression for a requested feature: a tick on each Biểu mẫu item marking
// whether that form is published on Patient Portal, cross-linking to the
// existing Patient Portal category the same way training_required already
// links across to Đào tạo — reusing that established convention rather than
// inventing a second cross-link mechanism.
describe("EMR Biểu mẫu — patient_portal_visible tick", () => {
  const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("declares patient_portal_visible as a 'boolean' field (a real tick, not a select dropdown)", () => {
    const field = fields.find((f) => f.key === "patient_portal_visible");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("boolean");
    expect(field?.label).toBe("Hiển thị trên Patient Portal");
  });

  it("formatBooleanValue() renders Có/Không, defaulting to Không for anything other than the literal 'true'", () => {
    expect(formatBooleanValue("true")).toBe("Có");
    expect(formatBooleanValue("false")).toBe("Không");
    expect(formatBooleanValue(undefined)).toBe("Không");
    expect(formatBooleanValue("")).toBe("Không");
  });

  it("renders a real checkbox using the .inline-check class in the create/edit modal, per the documented checkbox-sizing gotcha (never a raw <input> in a plain <label>)", () => {
    expect(client).toContain('f.type === "boolean"');
    expect(client).toMatch(/f\.type === "boolean" \? \(\s*<div key=\{f\.key\}>\s*<label className="inline-check">/);
  });

  it("cross-links to the Patient Portal category when checked, the same way training_required links to Đào tạo", () => {
    expect(client).toContain('f.key === "patient_portal_visible" && isTrue');
    expect(client).toContain('f.key === "patient_portal_visible" && form.details[f.key] === "true"');
    expect(client.match(/href="\/emr\/patient-portal"/g)?.length).toBe(2);
  });

  it("the Excel export formats it with formatBooleanValue() instead of the raw stored string", () => {
    const exportRoute = readFileSync("src/app/api/emr/items/export/route.ts", "utf8");
    expect(exportRoute).toContain('if (f.type === "boolean") return formatBooleanValue(raw);');
  });

  it("the server's generic sanitizeDetails() needs no special case for 'boolean' — stored as the literal string \"true\"/\"false\" like every other non-number field", () => {
    const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    for (const route of [postRoute, patchRoute]) {
      expect(route).not.toMatch(/f\.type === "boolean"/);
    }
  });
});
