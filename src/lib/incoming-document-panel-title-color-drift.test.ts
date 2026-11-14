import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện qua ảnh chụp production thật (mobile) người dùng gửi: "màu xanh
// không đồng bộ" — tiêu đề "Danh sách công văn" (.mobile-module-redesign
// .panel-title h2) dùng hardcode #15355f, một giá trị navy RIÊNG không
// trùng với bất kỳ token/hex nào khác trong app — trong khi tab đang active
// ngay phía trên cùng trang lại dùng đúng --qf-blue/#1D4ED8 (đã khoá ở
// incoming-document-view-tabs-style-drift.test.ts). #172554 là navy đậm đã
// dùng lặp lại nhiều nơi khác trong app (globals.css, final-visual-lock.css,
// app-shell.tsx — ví dụ .nav-group.active-context màu chữ) — đổi
// #15355f -> #172554 để khớp đúng tông navy đã thống nhất, không bịa màu mới.
describe("final-visual-lock.css: .mobile-module-redesign .panel-title h2 không còn navy lệch riêng (#15355f)", () => {
  it("không còn hardcode #15355f", () => {
    const source = read("src/app/final-visual-lock.css");
    expect(source).not.toContain("#15355f");
  });

  it("dùng đúng #172554 — navy đậm đã dùng lặp lại nhiều nơi khác trong app", () => {
    const source = read("src/app/final-visual-lock.css");
    expect(source).toContain(".workspace-app .mobile-module-redesign .panel-title h2{\n   font-size:15px!important;font-weight:800!important;line-height:1.35!important;\n   margin:0!important;color:#172554!important;\n }");
  });
});
