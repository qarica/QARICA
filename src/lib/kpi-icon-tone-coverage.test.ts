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
// rule CSS .kpi-icon.<tone>{...} — HOẶC trong cùng file, HOẶC trong
// globals.css (2026-11-13: globals.css nay định nghĩa sẵn 5 tông màu
// blue/green/amber/red/purple dùng chung cho KpiCard — trang nào chỉ dùng
// đúng 5 tông này không cần tự định nghĩa lại nữa; trang dùng tông ngoài 5
// tông đó vẫn phải tự định nghĩa .kpi-icon.<tone> như trước).
describe("Mọi className=\"kpi-icon <tone>\" đều có CSS .kpi-icon.<tone> tương ứng (cùng file, hoặc globals.css) — không bị thiếu màu khiến icon mất khung nền", () => {
  const files = globSync("src/app/**/*.tsx").concat(globSync("src/components/**/*.tsx"));
  const globalTones = new Set(
    Array.from(readFileSync("src/app/globals.css", "utf8").matchAll(/(?<![a-zA-Z0-9-])\.kpi-icon\.([a-z]+)\s*\{/g)).map((m) => m[1]),
  );

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
        if (!definedTones.has(tone) && !globalTones.has(tone)) problems.push(`${file}: thiếu .kpi-icon.${tone}{...} (đã dùng className="kpi-icon ${tone}", không có trong file lẫn globals.css)`);
      }
    }
    expect(problems).toEqual([]);
  });
});
