import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit user complaint, with a screenshot of a Biểu mẫu
// row wrapping across many lines: "Giao diện biểu mẫu chưa bố trí thích
// hợp... nên cân đối không nên chổ nhập quá nhiều chổ nhập quá ít nó ko đủ
// chổ hiển thị". Biểu mẫu alone had grown to ~11 extra fields, each its own
// table column — unreadable. Generic fix (any category, not just Biểu mẫu):
// a field can opt into `compact: true`, staying fully editable in the modal
// but moving out of the table's own <th>/<td> into a per-row expandable
// "Chi tiết" panel.
describe("EMR — compact fields move into a per-row expandable detail panel", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("splits afterTitleFields into columnFields (!compact) and detailFields (compact), both excluding hideFromGrid fields", () => {
    expect(client).toContain("const columnFields = afterTitleFields.filter((f) => !f.compact && !f.hideFromGrid);");
    expect(client).toContain("const detailFields = afterTitleFields.filter((f) => f.compact && !f.hideFromGrid);");
  });

  it("marks Biểu mẫu's secondary fields compact (execution_platform, target_roles, signing_sequence, storage_format, notes, patient_portal_visible), keeping the key status fields as real columns", () => {
    const fields = EMR_CATEGORY_FIELDS.BIEU_MAU;
    for (const key of ["execution_platform", "target_roles", "signing_sequence", "storage_format", "notes", "patient_portal_visible"]) {
      expect(fields.find((f) => f.key === key)?.compact).toBe(true);
    }
    for (const key of ["binding_group", "digitized", "deployment_phase", "training_required"]) {
      expect(fields.find((f) => f.key === key)?.compact).toBeFalsy();
    }
  });

  it("always renders the expand/collapse toggle column — every category's detail panel now also carries Tệp đính kèm and any incoming references", () => {
    expect(client).toContain('<tr><th style={{ width: 30 }}></th><th>#</th>');
    expect(client).toContain("function toggleExpanded(id: string)");
  });

  it("the expanded detail row reuses the same fieldDisplayContent() renderer as the real columns — never a second, divergent rendering path", () => {
    expect(client).toContain('{detailFields.map((f) => <div key={f.key}><label>{f.label}</label><div>{fieldDisplayContent(f, item)}</div></div>)}');
  });

  it("the create/edit modal still renders every field (including compact ones) — compact only affects the table, not editability", () => {
    expect(client).toContain('{extraFields.filter((f) => !f.pairWithStatus && !(categoryCode === "BIEU_MAU" && ["record_types", "form_code", "binding_group", "binding_group_order", "vendor_form_code", "execution_platform"].includes(f.key))).map((f) => (');
    expect(client).not.toContain("extraFields.filter((f) => !f.compact).map((f) => (");
  });
});
