import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_SIZE, fetchAllPages } from "./lab-supplies-paging";

// Mô phỏng PostgREST: cắt cứng ở PAGE_SIZE dòng/yêu cầu dù xin nhiều hơn.
const source = (n: number) => (from: number, to: number) => {
  const end = Math.min(to, from + PAGE_SIZE - 1, n - 1);
  const rows = from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i);
  return Promise.resolve({ data: rows, error: null });
};

describe("fetchAllPages: đọc đủ mọi dòng dù máy chủ cắt ở 1.000", () => {
  it("1.301 dòng → đủ 1.301, không trùng, không sót", async () => {
    const r = await fetchAllPages(source(1301));
    expect(r.data.length).toBe(1301);
    expect(new Set(r.data).size).toBe(1301);
    expect(r.data[0]).toBe(0);
    expect(r.data[1300]).toBe(1300);
    expect(r.error).toBeNull();
  });
  it("đúng bội số của 1.000 (2.000 dòng) vẫn dừng đúng, không lặp vô hạn", async () => {
    expect((await fetchAllPages(source(2000))).data.length).toBe(2000);
    expect((await fetchAllPages(source(1000))).data.length).toBe(1000);
  });
  it("rỗng, ít hơn một trang", async () => {
    expect((await fetchAllPages(source(0))).data.length).toBe(0);
    expect((await fetchAllPages(source(7))).data.length).toBe(7);
  });
  it("lỗi ở trang giữa: trả lỗi, không nuốt âm thầm", async () => {
    let call = 0;
    const r = await fetchAllPages(() => Promise.resolve(++call === 2 ? { data: null, error: { message: "boom" } } : { data: Array.from({ length: PAGE_SIZE }, (_, i) => i), error: null }));
    expect(r.error?.message).toBe("boom");
  });
  it("vượt maxRows: cắt đúng và báo truncated", async () => {
    const r = await fetchAllPages(source(5000), 2500);
    expect(r.data.length).toBe(2500);
    expect(r.truncated).toBe(true);
  });
});

describe("không còn truy vấn Kho nào bị cắt âm thầm ở 1.000 dòng", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : []; });
  const files = [...walk("src/app/api/lab-supplies"), "src/app/(app)/lab-supplies/page.tsx"];
  it(".limit(n) với n > 1000 chỉ được dùng cùng fetchAllPages", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.limit\((\d+)\)/g)) expect(Number(m[1]), `${f}: .limit(${m[1]})`).toBeLessThanOrEqual(1000);
    }
  });
  it("mọi nơi đọc vật tư / lô còn tồn / phiếu đầy đủ đều dùng fetchAllPages", () => {
    const need: [string, number][] = [["src/app/(app)/lab-supplies/page.tsx", 2], ["src/app/api/lab-supplies/export/route.ts", 3], ["src/app/api/lab-supplies/items/route.ts", 1], ["src/app/api/lab-supplies/items/[id]/card/route.ts", 1], ["src/app/api/lab-supplies/items/import/route.ts", 1], ["src/app/api/lab-supplies/report/route.ts", 1]];
    for (const [f, n] of need) expect((readFileSync(f, "utf8").match(/fetchAllPages\(/g) || []).length, f).toBeGreaterThanOrEqual(n);
  });
  it("các truy vấn phân trang có sắp xếp ổn định bằng khóa duy nhất", () => {
    expect(readFileSync("src/app/(app)/lab-supplies/page.tsx", "utf8")).toContain('.order("lot_id", { ascending: true })');
    expect(readFileSync("src/app/api/lab-supplies/export/route.ts", "utf8")).toContain('.order("id", { ascending: false })');
  });
});
