import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "Qarica ko xoay ngang theo quay ngang màn hình điện
// thoại" — khi cài như PWA (display: "standalone"), manifest orientation
// "portrait" khoá hẳn app ở chế độ đứng, màn hình điện thoại xoay ngang
// không có tác dụng. Đổi thành "any" để app xoay theo thiết bị như 1 trang
// web thường.
describe("PWA manifest: không khoá hướng màn hình", () => {
  it("orientation là 'any', không khoá 'portrait'", () => {
    const manifest = read("src/app/manifest.ts");
    expect(manifest).toContain('orientation: "any"');
    expect(manifest).not.toContain('orientation: "portrait"');
  });
});
