import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit complaint: "Danh sách lưới biểu mẫu đang gộp
// quá nhiều cột, rất khó nhìn và thanh trượt ở cuối dưới lưới khó thao tác
// kéo qua kéo lại, ẩn cột nhóm, lỗi liên quan, tài liệu hướng dẫn, tệp đính
// kèm ở danh sách lưới menu biểu mẫu, các nội dung này xem ở đúng menu riêng
// của nó". Fixed two different ways, both generic (not hardcoded to Biểu
// mẫu):
// 1. A field can opt into `hideFromGrid: true` when it already has its own
//    dedicated page (binding_group -> "Xem cây biểu mẫu") — excluded from
//    BOTH the table column and the compact detail panel, only editable in
//    the modal.
// 2. The generic cross-category "N liên quan" columns and the always-present
//    "Tệp đính kèm" column — which widen EVERY category's table, not just
//    Biểu mẫu's — moved out of their own <th>/<td> into the same per-row
//    expandable "Chi tiết" panel compact fields already use, cutting column
//    count without losing the information.
describe("EMR grid — declutter columns that have their own dedicated view", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("binding_group (Nhóm gáy) is hideFromGrid — it already has its own 'Xem cây biểu mẫu' page", () => {
    expect(EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "binding_group")?.hideFromGrid).toBe(true);
  });

  it("columnFields and detailFields both exclude hideFromGrid fields — hidden fields never appear in the grid at all", () => {
    expect(client).toContain("const columnFields = afterTitleFields.filter((f) => !f.compact && !f.hideFromGrid);");
    expect(client).toContain("const detailFields = afterTitleFields.filter((f) => f.compact && !f.hideFromGrid);");
  });

  it("a hideFromGrid field is still editable in the create/edit modal — hideFromGrid only affects the table, not editability", () => {
    expect(client).toContain("{extraFields.filter((f) => !f.pairWithStatus).map((f) => (");
  });

  it("the table header no longer has a <th> per incoming reference or a Tệp đính kèm column", () => {
    expect(client).not.toContain("{genericIncomingReferences.map((ref)=><th key={ref.category}>{categoryLabelFor(ref.category)} liên quan</th>)}");
    expect(client).not.toContain("<th>Tệp đính kèm</th>");
  });

  it("incoming references and Tệp đính kèm now render inside the expandable detail panel instead", () => {
    expect(client).toContain('{genericIncomingReferences.map((ref) => {');
    expect(client).toContain('<div><label>Tệp đính kèm</label>');
  });
});
