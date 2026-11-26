import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "Quét lại toàn bộ app" (full recurring-bug sweep) phát hiện: checkbox
// chọn/bỏ 1 dòng trong preview nhập file (tab Nhập dữ liệu) đặt trần trong
// .ptd-import-row (không bọc .inline-check/.radio-row/.check-card). An toàn
// trên mobile nhờ safety-net @media(max-width:760px) trong final-visual-
// lock.css, nhưng KHÔNG được bảo vệ trên desktop (>760px) — CSS mặc định
// toàn cục input{width:100%;min-height:40px} áp vào checkbox này, phá vỡ
// bố cục hàng flex (status-badge/tên/ghi chú bị đẩy lệch).
//
// Báo cáo audit UI/UX sau đó: override width/min-height viết tay riêng ở
// đây trùng lặp với rule chung .check-card/.department-checks/.permission-
// list/.radio-row/.inline-check/.switch-row input đã có sẵn trong
// globals.css — gộp .ptd-import-row vào CÙNG 1 rule chung đó (CLAUDE.md
// nguyên tắc 2: một nghiệp vụ chỉ một nguồn sự thật) thay vì duy trì 2
// nguồn CSS cho cùng 1 vấn đề kích thước checkbox. Chỉ còn giữ lại riêng
// `flex: 0 0 auto` (đặc thù bố cục hàng flex của ImportTab, không nằm
// trong rule chung) ở <style jsx> của chính component.
describe("ImportTab — checkbox chọn dòng preview nhập file không còn to bất thường trên desktop", () => {
  const source = readFileSync("src/components/procedure-training-detail-client.tsx", "utf8");
  const globalCss = readFileSync("src/app/globals.css", "utf8");

  it("kích thước checkbox (.width:auto;min-height:0) đến từ rule chung trong globals.css, không viết tay riêng trong component", () => {
    expect(globalCss).toContain(".ptd-import-row input{width:auto;min-height:0;margin:2px 0 0}");
    expect(source).not.toContain('.ptd-import-row input[type="checkbox"] {\n          width: auto;\n          min-height: 0;');
  });

  it(".ptd-import-row vẫn giữ flex:0 0 auto riêng (đặc thù bố cục hàng flex, không có trong rule chung)", () => {
    expect(source).toContain('.ptd-import-row input[type="checkbox"] {\n          flex: 0 0 auto;\n        }');
  });
});
