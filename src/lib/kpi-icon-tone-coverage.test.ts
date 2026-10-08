import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ ảnh chụp thực tế: icon "Đã hoàn thành" ở trang CAPA mất hẳn
// khung nền màu (dùng className="kpi-icon green" nhưng CSS của trang chỉ
// định nghĩa .kpi-icon.blue/.amber/.purple/.red, thiếu .green) — cùng lỗi
// lặp lại ở trang Evidence (thiếu .kpi-icon.red). Quét TOÀN BỘ codebase 1
// lần cho đúng nguyên tắc "sửa tận gốc, chặn tái diễn" thay vì chỉ test 2
// chỗ đã biết — mọi className="kpi-icon <tone>" (class gốc dùng chung, KHÔNG
// tính các biến thể riêng đã tự đặt tên và tự định nghĩa đủ màu như
// .recurring-kpi-icon/.tqm-registry-kpi-icon/.iq-kpi-icon) phải có đúng 1
// rule CSS .kpi-icon.<tone>{...} trong cùng file.
describe("Mọi className=\"kpi-icon <tone>\" đều có CSS .kpi-icon.<tone> tương ứng trong cùng file (không bị thiếu màu khiến icon mất khung nền)", () => {
  const files = globSync("src/app/**/*.tsx").concat(globSync("src/components/**/*.tsx"));

  it("quét toàn bộ src/app và src/components", () => {
    const problems: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const usedTones = new Set(
        Array.from(text.matchAll(/(?<![a-zA-Z0-9-])kpi-icon\s+([a-z]+)"/g)).map((m) => m[1]),
      );
      if (!usedTones.size) continue;
      const definedTones = new Set(
        Array.from(text.matchAll(/(?<![a-zA-Z0-9-])\.kpi-icon\.([a-z]+)\s*\{/g)).map((m) => m[1]),
      );
      for (const tone of usedTones) {
        if (!definedTones.has(tone)) problems.push(`${file}: thiếu .kpi-icon.${tone}{...} (đã dùng className="kpi-icon ${tone}")`);
      }
    }
    expect(problems).toEqual([]);
  });
});
