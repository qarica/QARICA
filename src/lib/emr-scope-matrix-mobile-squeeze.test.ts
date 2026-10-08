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
  // Phát hiện tiếp theo (báo cáo thực tế, kèm ảnh): ngay cả sau fix width:auto
  // ở trên, tên biểu mẫu vẫn vỡ TỪNG KÝ TỰ MỘT trên mobile khi bảng có nhiều
  // cột khoa/phòng. Xác nhận bằng cách dựng lại đúng cấu trúc bảng (colgroup +
  // thead 2 dòng rowSpan/colSpan) và đo trong Chromium ở 390px:
  // table-layout:fixed VỚI width:auto vẫn chỉ resolve về đúng 100% khung chứa
  // (390px) bất kể tổng width khai báo trên <col>/<th> (200+86×7=802px) — tức
  // width:auto trên bảng không có nghĩa "tự nới theo nội dung" như kỳ vọng, mà
  // hành xử như width:100% bình thường (table vẫn luôn co vừa khung chứa khi
  // không có ràng buộc nào khác buộc nó rộng hơn). Cột đầu (sticky, chứa tên
  // biểu mẫu) vì vậy bị ép từ 200px xuống còn ~87px, và vì nó là flex
  // container với align-items:flex-start (không stretch), <strong> bên trong
  // tính kích thước theo fit-content/min-content — với word-break:break-word,
  // min-content của một chuỗi bất kỳ có thể hẹp tới 1 KÝ TỰ, nên chữ vỡ từng
  // ký tự một trong khung quá hẹp đó.
  // Sửa: width:max-content (không phải width:auto) — max-content là kích
  // thước tự nhiên của bảng theo đúng tổng width khai báo trên <col>/<th>,
  // không phụ thuộc khung chứa; kết hợp min-width:100% vẫn giữ bảng lấp đầy
  // panel trên màn rộng (min-width:100% chỉ có tác dụng khi 100% > max-content).
  // Đo lại sau khi sửa: bảng rộng 858px (đúng tổng cột), cột đầu đúng 200px,
  // chữ xuống dòng theo từ bình thường (136px cho <strong>, không còn ép 1 ký
  // tự/dòng); ở màn rộng 1200px bảng vẫn giãn đủ 1200px (min-width:100% vẫn
  // đúng vai trò cũ).
  it("table dùng width:max-content (không phải width:auto) để luôn giữ đúng tổng width khai báo trên <col>/<th> làm sàn, bất kể khung chứa hẹp tới đâu; min-width:100% vẫn giữ full-width trên màn rộng", () => {
    expect(client).toContain(".emr-scope-matrix table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:max-content;min-width:100%}");
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

// Phát hiện (báo cáo thực tế: "Bấm chọn tất cả khoa thì ko hủy được", sau đó
// "Bấm hoàn tác chỉ có ô BGD thay đổi các ô còn lại như cũ"): bản đầu dùng
// snapshot department_ids trước lúc bấm để nút đổi thành "Hoàn tác" — gây
// bất ngờ vì snapshot đó có thể đã sẵn một phần khoa được tick từ trước, nên
// hoàn tác chỉ đổi đúng phần vừa thêm, các ô khác "như cũ" khiến người dùng
// tưởng chạy sai. Bỏ hẳn cơ chế snapshot, dùng 1 cặp nút tường minh, luôn ra
// kết quả có thể đoán trước, không phụ thuộc trạng thái trước đó: "Chọn tất
// cả khoa" (gán danh sách đủ mọi khoa lâm sàng) và "Bỏ chọn tất cả" (đặt lại
// department_ids rỗng — mặc định "toàn viện").
describe("EMR Phạm vi áp dụng — cặp nút 'Chọn tất cả khoa' / 'Bỏ chọn tất cả' tường minh, không dùng snapshot hoàn tác", () => {
  it("không còn cơ chế snapshot/hoàn tác cũ", () => {
    expect(client).not.toContain("scopeUndoSnapshots");
    expect(client).not.toContain("undoSelectAllDepartmentsForItem");
    expect(client).not.toContain(">\n                                Hoàn tác\n");
  });

  it("có hàm đặt lại department_ids về rỗng (toàn viện), độc lập với giá trị trước đó", () => {
    expect(client).toContain("async function clearAllDepartmentsForItem(item: Item) {");
    expect(client).toContain("setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, department_ids: [] } : i)));");
    expect(client).toContain('body: JSON.stringify({ department_ids: [] })');
  });

  it("nút đổi thành 'Bỏ chọn tất cả' khi đã chọn tường minh đủ mọi khoa lâm sàng, không dựa vào việc nút có vừa được bấm hay chưa", () => {
    expect(client).toContain("const explicitAllSelected = item.department_ids.length > 0 && clinicalDepartments.length > 0 && clinicalDepartments.every((d) => item.department_ids.includes(d.id));");
    expect(client).toContain("explicitAllSelected ? (");
    expect(client).toContain("onClick={() => clearAllDepartmentsForItem(item)}");
    expect(client).toContain(">\n                                Bỏ chọn tất cả\n");
  });
});
