import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu: xây modal khai báo Biểu mẫu "đẹp" theo tham khảo (ảnh "Cấu trúc
// gáy HSBA" + "Định danh biểu mẫu") — gộp các field cấu trúc gáy/định danh
// vào 2 fieldset có tiêu đề, thay vì liệt kê phẳng như trước; thêm 1 field
// tham chiếu chéo hệ thống EMR khác (đặt tên chung chung, KHÔNG hard-code
// theo 1 nhà cung cấp cụ thể). Phần này không cần migration (chỉ dùng
// details jsonb đã có sẵn) — tách khỏi phần "Mã nhóm gáy La Mã"
// (emr-bieu-mau-group-code.test.ts), phần đó cần thêm cột DB riêng.
describe("EMR Biểu mẫu — nhóm fieldset 'Cấu trúc gáy HSBA' / 'Định danh biểu mẫu'", () => {
  const categories = read("src/lib/emr-categories.ts");
  const client = read("src/components/emr-category-client.tsx");

  it("thêm field tham chiếu chéo hệ thống EMR khác cho BIEU_MAU — tên chung chung, không gắn 1 nhà cung cấp cụ thể", () => {
    const fieldsBlock = categories.slice(categories.indexOf("export const EMR_CATEGORY_FIELDS"));
    const bieuMauBlock = fieldsBlock.slice(fieldsBlock.indexOf("BIEU_MAU: ["), fieldsBlock.indexOf("LOI: ["));
    expect(bieuMauBlock).toContain('{ key: "vendor_form_code"');
    expect(bieuMauBlock).not.toMatch(/FPT|Viettel|VNPT/i);
  });

  it("modal khai báo Biểu mẫu gộp Nhóm gáy/Thứ tự trong gáy vào fieldset 'Cấu trúc gáy HSBA'", () => {
    expect(client).toContain("<legend>Cấu trúc gáy HSBA</legend>");
    expect(client).toContain("details.binding_group");
    expect(client).toContain("details.binding_group_order");
  });

  it("modal khai báo Biểu mẫu gộp Mã biểu mẫu/Mã mẫu tham chiếu vào fieldset 'Định danh biểu mẫu'", () => {
    expect(client).toContain("<legend>Định danh biểu mẫu</legend>");
    expect(client).toContain("details.vendor_form_code");
  });

  it("2 fieldset chỉ render cho BIEU_MAU, không ảnh hưởng danh mục khác", () => {
    expect(client).toContain('categoryCode === "BIEU_MAU" ? (');
    expect(client).toContain("emr-bieu-mau-identity-grid");
  });

  it("4 field đã chuyển vào fieldset riêng bị loại khỏi vòng lặp field chung (tránh lặp lại 2 lần trong modal)", () => {
    expect(client).toContain(
      '["record_types", "form_code", "binding_group", "binding_group_order", "vendor_form_code"].includes(f.key)',
    );
  });
});
