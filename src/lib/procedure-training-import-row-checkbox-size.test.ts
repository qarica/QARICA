import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "Quét lại toàn bộ app" (full recurring-bug sweep) phát hiện: checkbox
// chọn/bỏ 1 dòng trong preview nhập file (tab Nhập dữ liệu) đặt trần trong
// .ptd-import-row (không bọc .inline-check/.radio-row/.check-card). An toàn
// trên mobile nhờ safety-net @media(max-width:760px) trong final-visual-
// lock.css, nhưng KHÔNG được bảo vệ trên desktop (>760px) — CSS mặc định
// toàn cục input{width:100%;min-height:40px} áp vào checkbox này, phá vỡ
// bố cục hàng flex (status-badge/tên/ghi chú bị đẩy lệch). Cùng lớp lỗi đã
// sửa nhiều lần trong session này (vd personal-workspace-reminder-checkbox-
// size.test.ts) — sửa bằng override input[type="checkbox"]{width:auto;
// min-height:0} ngay trong <style jsx> của chính ImportTab.
describe("ImportTab — checkbox chọn dòng preview nhập file không còn to bất thường trên desktop", () => {
  const source = readFileSync("src/components/procedure-training-detail-client.tsx", "utf8");

  it(".ptd-import-row có override kích thước cho input[type=checkbox]", () => {
    expect(source).toContain('.ptd-import-row input[type="checkbox"] {\n          width: auto;\n          min-height: 0;\n          flex: 0 0 auto;\n        }');
  });
});
