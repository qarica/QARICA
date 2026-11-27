import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Kho hóa chất & Kho vật tư là module TÁCH BIỆT, không liên quan các menu còn lại (yêu cầu từ lúc xây).
// Test này giữ ranh giới 2 chiều để về sau không ai vô tình nối Kho với module khác.
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const files = walk("src").filter((f) => !f.endsWith(".test.ts"));
const isKho = (f: string) => /lab-supplies|lab-supply|\/api\/lab-supplies\/|\(app\)\/lab-supplies\//.test(f.replace(/\\/g, "/"));

describe("Kho tách biệt: module khác KHÔNG dùng mã/CSS của Kho", () => {
  it("không file ngoài Kho nào import từ mã của Kho (trừ menu điều hướng và trang route chuyển hướng)", () => {
    const allowed = new Set(["src/lib/navigation.ts"]);
    const offenders = files.filter((f) => !isKho(f) && !allowed.has(f.replace(/\\/g, "/"))).filter((f) => /from\s+["'][^"']*lab-suppl/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("ô ngày và thư viện ngày DÙNG CHUNG không nhắc tới Kho (không import, không dùng class .ls-)", () => {
    for (const f of ["src/components/vn-date-input.tsx", "src/lib/vn-date.ts"]) {
      const c = readFileSync(f, "utf8");
      expect(c, f).not.toMatch(/lab-suppl/);
      expect(c, f).not.toMatch(/["'\s]ls-date/);
    }
  });
  it("CSS toàn cục không chứa class riêng của Kho (.ls-*)", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).not.toMatch(/\.ls-/);
  });
});

describe("Kho tách biệt: mã của Kho chỉ dựa vào hạ tầng chung, không dựa vào module nghiệp vụ khác", () => {
  it("import từ '@/…' của file Kho chỉ thuộc: chính Kho, biểu tượng/khung trang chung, xác thực/API, Supabase", () => {
    const OK = /^(@\/(components|lib)\/(lab-supplies[\w-]*|icon|page-header|auth|api-auth|supabase\/(server|admin|client))|@\/lib\/lab-supplies[\w-]*)$/;
    const bad: string[] = [];
    for (const f of files.filter(isKho)) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+["'](@\/[^"']+)["']/g)) if (!OK.test(m[1])) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
