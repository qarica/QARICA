import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

const read = (p: string) => readFileSync(p, "utf8");

// Báo cáo thực tế: "Xuất excel biểu mẫu xoá cột mẫu tham chiếu hệ thống EMR
// khác nếu có" — file Excel xuất ra đưa MỌI field của danh mục thành cột, kể
// cả field đã khai báo hideFromGrid (vendor_form_code, binding_group,
// binding_group_order) để ẩn khỏi lưới chính vì "trang xem thật sự ở nơi
// khác" (Cây biểu mẫu) — cùng loại lệch nhất quán UI↔export CLAUDE.md yêu
// cầu đối chiếu, chỉ ngược hướng với bug "thiếu cột Duyệt phát hành" đã sửa
// trước đó (emr-bieu-mau-export-publish-status.test.ts).
describe("EMR Excel export — field hideFromGrid không thành cột export", () => {
  const route = read("src/app/api/emr/items/export/route.ts");

  it("extraFields lọc bỏ field hideFromGrid trước khi dùng cho header/cell/colCount", () => {
    expect(route).toContain(
      "const extraFields = (EMR_CATEGORY_FIELDS[category.code as keyof typeof EMR_CATEGORY_FIELDS] || []).filter((f) => !f.hideFromGrid);"
    );
  });

  it("BIEU_MAU hiện có đúng 3 field hideFromGrid sẽ bị loại khỏi export: vendor_form_code, binding_group, binding_group_order", () => {
    const hidden = EMR_CATEGORY_FIELDS.BIEU_MAU.filter((f) => f.hideFromGrid).map((f) => f.key);
    expect(hidden.sort()).toEqual(["binding_group", "binding_group_order", "vendor_form_code"].sort());
  });

  it("Cây biểu mẫu vẫn nhóm export theo binding_group bình thường — groupByField tra riêng từ EMR_CATEGORY_FIELDS chưa lọc, không phụ thuộc extraFields", () => {
    expect(route).toContain(
      "const groupByField = (EMR_CATEGORY_FIELDS[category.code as keyof typeof EMR_CATEGORY_FIELDS] || []).find((f) => f.key === groupByParam);"
    );
  });
});
