import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Bug class: a field present in a create/edit form's submitted body but only
// handled by one of the two routes (POST vs PATCH) silently no-ops on the
// other action. Here: "Loại nội dung" (item_type) is shown and editable on
// root-level criteria items (code/GROUP) in criteria-set-editor-client.tsx's
// shared create+edit modal, sent in the PATCH body on every save, but the
// PATCH route never read it — so converting an existing root item between
// "Tiêu chí" (CRITERION) and "Phần / nhóm trong bộ" (GROUP) silently did
// nothing while the UI reported "Đã lưu." as if it succeeded.
describe("criteria item edit handles item_type like create does", () => {
  const source = readFileSync("src/app/api/criteria-items/[id]/route.ts", "utf8");

  it("reads body.item_type and writes patch.item_type for root items", () => {
    expect(source).toContain('hasOwnProperty.call(body,"item_type")');
    expect(source).toContain("patch.item_type=requestedItemType");
  });

  it("only accepts CRITERION or GROUP, matching the create RPC's root-item rule", () => {
    expect(source).toContain('requestedItemType!=="CRITERION"&&requestedItemType!=="GROUP"');
  });

  it("never lets a sub-item's forced item_type be overridden through this field", () => {
    expect(source).toContain('hasOwnProperty.call(body,"item_type")&&!item.parent_criteria_item_id');
  });
});
