import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

// Phát hiện từ ảnh chụp thực tế trên điện thoại ("Cây biểu mẫu"): cột "Tên
// biểu mẫu" vỡ chữ (xuống dòng từng âm tiết) và tiêu đề cột lệch trên màn
// hình hẹp — cùng nguyên nhân (và cùng cách sửa) với bảng "Phạm vi áp dụng"
// (emr-scope-matrix-mobile-squeeze.test.ts): table-layout mặc định (auto) +
// width:100% (kế thừa từ rule chung trong globals.css) ép bảng co vừa khung
// hình thay vì tràn ra và cuộn ngang qua .table-wrap{overflow:auto}.
describe("EMR Cây biểu mẫu — bảng không bị ép co cột trên màn hình hẹp (mobile)", () => {
  it("table có colgroup khai báo width cố định từng cột (kể cả khi ẩn cột theo canManage)", () => {
    expect(client).toContain('<table className="bieu-mau-tree-table">');
    expect(client).toContain("<colgroup>");
    expect(client).toContain("{canManage ? <col style={{ width: 70 }} /> : null}");
  });

  // width:auto (thay vì width:max-content) hoá ra KHÔNG đủ: xác nhận bằng
  // Chromium thật rằng table-layout:fixed;width:auto;min-width:100% vẫn chỉ
  // resolve về đúng 100% khung chứa bất kể tổng width khai báo trên <col> —
  // width:auto không có nghĩa "tự nới theo nội dung" cho bảng, nó hành xử như
  // width:100% khi không có ràng buộc nào khác. width:max-content mới là
  // "kích thước tự nhiên theo đúng tổng cột", không phụ thuộc khung chứa; kết
  // hợp min-width:100% vẫn giữ bảng lấp đầy panel trên màn rộng (xem
  // emr-scope-matrix-mobile-squeeze.test.ts — cùng bug, cùng cách sửa, phát
  // hiện lại ở bảng "Phạm vi áp dụng" với ảnh chụp chữ vỡ từng ký tự một).
  it("table-layout:fixed + width:max-content;min-width:100% để cột giữ đúng width khai báo, tràn ra và cuộn ngang thay vì bị ép co", () => {
    expect(client).toContain(".bieu-mau-tree-table{table-layout:fixed;width:max-content;min-width:100%}");
  });
});
