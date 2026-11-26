import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("khung tìm kiếm không còn viền đôi", () => {
  const css = read("src/app/final-visual-lock.css");
  it("ô nhập trong .search-box bỏ viền/bóng/nền (ghi đè .workspace-app input !important)", () => {
    const i = css.indexOf(".workspace-app .search-box input,");
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, css.indexOf("}", i));
    for (const d of ["border:0!important", "box-shadow:none!important", "background:transparent!important", "min-height:0!important"]) expect(block).toContain(d);
  });
  it("chỉ nhắm ô nhập nằm trong .search-box, không đụng ô nhập thường", () => {
    const i = css.indexOf(".workspace-app .search-box input,");
    const block = css.slice(i, css.indexOf("{", i));
    expect(block).not.toMatch(/(^|,)\s*\.workspace-app input/);
  });
  it("vòng focus vẫn do .search-box:focus-within đảm nhận (rule gốc còn nguyên)", () => {
    expect(read("src/app/qarica-design-system.css")).toContain(".workspace-app .search-box:focus-within");
  });
});

describe("kho hóa chất: dòng trống không bị cắt chữ trong bảng cuộn ngang", () => {
  it("dòng trống trong ô bảng được ghim mép trái và giới hạn theo khung nhìn", () => {
    const src = read("src/components/lab-supplies-client.tsx");
    expect(src).toContain(".lab-supplies td>.empty-state{position:sticky;left:0;box-sizing:border-box;width:min(100%,calc(100vw - 72px))}");
  });
});
