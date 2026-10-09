import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Tự rà sau khi ship tính năng duyệt phát hành: lưới chính của Biểu mẫu đã có
// cột "Duyệt phát hành" (badge Nháp/Đã duyệt) nhưng Excel xuất ra
// (/api/emr/items/export) không có — đúng kiểu thiếu nhất quán UI↔export
// CLAUDE.md yêu cầu đối chiếu. Thêm cột tương ứng, chỉ cho BIEU_MAU.
describe("EMR Biểu mẫu — Excel export có cột 'Duyệt phát hành'", () => {
  const route = read("src/app/api/emr/items/export/route.ts");

  it("select lấy publish_status", () => {
    expect(route).toContain('.select("title,description,status,department_ids,owner_department_id,due_date,priority,is_go_live_gate,details,publish_status,created_at")');
  });

  it("chỉ thêm cột/cell cho BIEU_MAU — các danh mục khác không có khái niệm duyệt phát hành", () => {
    expect(route).toContain('const isBieuMau = category.code === "BIEU_MAU";');
    expect(route).toContain('${isBieuMau ? "<th>Duyệt phát hành</th>" : ""}');
    expect(route).toContain('const publishCell = isBieuMau ? `<td>${it.publish_status === "PUBLISHED" ? "Đã duyệt" : "Nháp"}</td>` : "";');
  });

  it("colCount (dùng cho dòng 'Chưa có dữ liệu' colspan) cộng thêm 1 khi có cột Duyệt phát hành, tránh lệch bảng", () => {
    expect(route).toContain("const colCount = 9 + extraFields.length + (isBieuMau ? 1 : 0);");
  });
});
