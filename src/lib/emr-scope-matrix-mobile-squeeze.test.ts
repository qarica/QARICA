import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

// Phát hiện từ ảnh chụp thực tế trên điện thoại: bảng "Phạm vi áp dụng" vỡ
// layout trên màn hình hẹp — chữ tên khoa/loại hồ sơ bị vỡ từng ký tự một
// (vd "ĐIỀU TRỊ BÁN NGÀY" xuống dòng từng chữ cái), và có khoảng trắng lớn
// giữa 2 dòng tiêu đề với nội dung bảng.
//
// Nguyên nhân: `table-layout:fixed` kết hợp `width:100%` (kế thừa từ rule
// chung `table{width:100%}` trong globals.css) khiến trình duyệt ép TẤT CẢ
// cột co tỷ lệ lại cho vừa đúng 100% khung nhìn, bất kể width khai báo trên
// <col>/<th> (86px/200px) — trên desktop không lộ ra vì 100% đã đủ rộng hơn
// tổng các cột, nhưng trên điện thoại (màn hẹp) cột bị ép xuống chỉ còn vài
// px, khiến `word-break:break-word` phải vỡ TỪNG KÝ TỰ để vừa cột cực hẹp.
// Cột bị ép cũng làm dòng tiêu đề thứ 2 (sticky, neo theo dòng 1) bị đẩy cao
// bất thường do chữ xuống hàng loạt — tạo khoảng trắng lớn trước khi thấy
// nội dung bảng.
//
// Sửa: table-layout:fixed CHỈ tôn trọng width px tuyệt đối của <col>/<th>
// khi width của <table> là "auto" (không phải %) — table sẽ tự nới rộng
// bằng đúng tổng các cột khai báo và tràn ra ngoài khung nhìn hẹp, để
// .table-wrap{overflow:auto} cuộn ngang đúng như thiết kế ban đầu, thay vì
// bị ép co lại. min-width:100% giữ nguyên hành vi cũ trên màn rộng (bảng vẫn
// lấp đầy panel khi tổng các cột hẹp hơn 100%).
describe("EMR Phạm vi áp dụng — bảng không bị ép co cột trên màn hình hẹp (mobile)", () => {
  it("table dùng width:auto (không phải %) để table-layout:fixed tôn trọng đúng width px của từng cột, min-width:100% giữ full-width trên màn rộng", () => {
    expect(client).toContain(".emr-scope-matrix table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:auto;min-width:100%}");
  });

  it("dòng tiêu đề đầu (corner + nhóm cột) có chiều cao cố định để offset sticky của dòng 2 (top:37px) luôn đúng, không phụ thuộc nội dung", () => {
    expect(client).toContain(".emr-scope-matrix thead tr:first-child th{top:0;height:37px}");
  });
});

// Phát hiện từ ảnh chụp thực tế trên điện thoại: tên biểu mẫu dài (vd "...cho
// trẻ dưới 6 tháng tuổi tại các cơ sở tiêm chủng thuộc bệnh viện") tràn ra
// ngoài cột sticky bên trái (chỉ rộng 200px) thay vì xuống dòng, đè lên vùng
// checkbox bên cạnh và làm cả hàng trông như trống rỗng ở trên, chỉ còn vài
// chữ cuối câu bị cắt hiện ra ở dưới. Nguyên nhân: cột đầu (.emr-scope-row-head)
// bị ép white-space:nowrap trong khi .emr-scope-col-head (tiêu đề cột) đã
// đúng từ trước (white-space:normal;word-break:break-word).
describe("EMR Phạm vi áp dụng — tên biểu mẫu dài xuống dòng trong cột sticky, không tràn ra ngoài", () => {
  it("cột tên biểu mẫu (sticky trái) cho phép xuống dòng thay vì ép 1 dòng rồi tràn ra ngoài khung 200px", () => {
    expect(client).toContain(".emr-scope-matrix td.emr-scope-row-head,.emr-scope-matrix th.emr-scope-corner{position:sticky;left:0;z-index:1;background:#fff;text-align:left;white-space:normal;word-break:break-word}");
  });
});
