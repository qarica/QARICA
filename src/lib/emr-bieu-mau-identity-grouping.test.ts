import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu ban đầu: gộp các field cấu trúc gáy/định danh của Biểu mẫu vào 2
// fieldset có tiêu đề trong modal "Thêm mục biểu mẫu" ("Cấu trúc gáy HSBA" +
// "Định danh biểu mẫu"), thêm field tham chiếu chéo hệ thống EMR khác (đặt
// tên chung chung, KHÔNG hard-code theo 1 nhà cung cấp cụ thể).
//
// Báo cáo thực tế tiếp theo (kèm ảnh khoanh đỏ 3 field): "ẩn các ô đỏ vì các
// nút khác đã có" — "Cấu trúc gáy HSBA" (Nhóm gáy/Thứ tự trong gáy) trùng với
// màn hình "Cây biểu mẫu", "Mã mẫu tham chiếu hệ thống EMR khác" trùng với
// "Mã biểu mẫu", và "Nơi thực hiện" trùng với phạm vi áp dụng (ma trận
// khoa/phòng + loại hồ sơ). Modal rút gọn chỉ còn 1 input "Mã biểu mẫu" —
// KHÔNG xoá field khỏi EMR_CATEGORY_FIELDS (binding_group/binding_group_order
// vẫn được Cây biểu mẫu đọc/ghi qua PATCH, vendor_form_code/execution_platform
// giữ nguyên để không mất dữ liệu cũ đã lưu).
describe("EMR Biểu mẫu — modal 'Thêm mục biểu mẫu' rút gọn (ẩn Cấu trúc gáy HSBA, Mã mẫu tham chiếu, Nơi thực hiện)", () => {
  const categories = read("src/lib/emr-categories.ts");
  const client = read("src/components/emr-category-client.tsx");

  it("field tham chiếu chéo hệ thống EMR khác vẫn tồn tại trong EMR_CATEGORY_FIELDS (không xoá, chỉ ẩn khỏi modal) — tên chung chung, không gắn 1 nhà cung cấp cụ thể", () => {
    const fieldsBlock = categories.slice(categories.indexOf("export const EMR_CATEGORY_FIELDS"));
    const bieuMauBlock = fieldsBlock.slice(fieldsBlock.indexOf("BIEU_MAU: ["), fieldsBlock.indexOf("LOI: ["));
    expect(bieuMauBlock).toContain('{ key: "vendor_form_code"');
    expect(bieuMauBlock).not.toMatch(/FPT|Viettel|VNPT/i);
  });

  it("modal KHÔNG còn render fieldset 'Cấu trúc gáy HSBA' hay 'Định danh biểu mẫu' — bỏ input Nhóm gáy/Thứ tự trong gáy/Mã mẫu tham chiếu", () => {
    expect(client).not.toContain("<legend>Cấu trúc gáy HSBA</legend>");
    expect(client).not.toContain("<legend>Định danh biểu mẫu</legend>");
    expect(client).not.toContain("binding_group_order: e.target.value");
    expect(client).not.toContain("vendor_form_code: e.target.value");
  });

  it("modal chỉ còn lại input 'Mã biểu mẫu' (form_code) cho BIEU_MAU, không bọc trong fieldset nữa", () => {
    expect(client).toContain('{categoryCode === "BIEU_MAU" ? (\n                <label>Mã biểu mẫu');
    expect(client).toContain("details: { ...form.details, form_code: e.target.value }");
  });

  it("binding_group/binding_group_order/vendor_form_code/execution_platform đã ẩn khỏi modal bị loại khỏi vòng lặp field chung (tránh lặp lại 2 lần, và tránh hiện lại input đã ẩn)", () => {
    expect(client).toContain(
      '["record_types", "form_code", "binding_group", "binding_group_order", "vendor_form_code", "execution_platform"].includes(f.key)',
    );
  });

  it("Cây biểu mẫu (emr-bieu-mau-tree-client.tsx) vẫn còn đọc/ghi binding_group/binding_group_order — field không bị mồ côi sau khi ẩn khỏi modal này", () => {
    const tree = read("src/components/emr-bieu-mau-tree-client.tsx");
    expect(tree).toContain("binding_group");
    expect(tree).toContain("binding_group_order");
  });
});
