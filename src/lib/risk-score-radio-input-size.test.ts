import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/risk-score-calculator-client.tsx", "utf8");

// Phát hiện từ ảnh chụp thực tế trên điện thoại ("Thang điểm nguy cơ lâm
// sàng"): nút tròn radio hiện tách rời rất xa khỏi nhãn ("1 — Hoàn toàn hạn
// chế"...) thay vì nằm sát cạnh nhau. Đây đúng gotcha đã ghi trong CLAUDE.md:
// input checkbox/radio để trần trong <label> (không có class
// .inline-check/.radio-row/.check-card/...) bị CSS mặc định toàn cục
// `input,select,textarea{width:100%;min-height:40px}` áp vào, khiến ô input
// chiếm trọn chiều ngang dòng flex và đẩy nhãn ra xa.
describe("Thang điểm nguy cơ lâm sàng — input radio không còn bị CSS mặc định input{width:100%} đẩy lệch khỏi nhãn", () => {
  it("có CSS riêng ghi đè width:auto;min-height:0 cho input trong .rsc-options, cùng quy ước .radio-row/.inline-check đã dùng ở các nơi khác", () => {
    expect(client).toContain(".rsc-options input{width:auto;min-height:0;margin:0;flex:0 0 auto}");
  });
});
