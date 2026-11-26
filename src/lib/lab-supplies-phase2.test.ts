import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STOCKTAKE_LARGE_DIFF_PCT, isLargeStocktakeDiff } from "./lab-supplies";

const read = (p: string) => readFileSync(p, "utf8");

describe("kiểm kê chênh lệch lớn", () => {
  it("lệch trên ngưỡng % so với tồn sổ là lớn; đúng ngưỡng hoặc nhỏ hơn thì không", () => {
    expect(STOCKTAKE_LARGE_DIFF_PCT).toBe(10);
    expect(isLargeStocktakeDiff(100, 100)).toBe(false);
    expect(isLargeStocktakeDiff(100, 90)).toBe(false); // đúng 10%
    expect(isLargeStocktakeDiff(100, 89)).toBe(true);
    expect(isLargeStocktakeDiff(100, 111)).toBe(true);
    expect(isLargeStocktakeDiff(10, 9)).toBe(false);
    expect(isLargeStocktakeDiff(10, 8)).toBe(true);
  });
  it("tồn sổ bằng 0 mà đếm được hàng là lớn; cả hai bằng 0 thì không", () => {
    expect(isLargeStocktakeDiff(0, 3)).toBe(true);
    expect(isLargeStocktakeDiff(0, 0)).toBe(false);
  });
  it("API và giao diện cùng áp quy tắc (UI ↔ API nhất quán)", () => {
    const api = read("src/app/api/lab-supplies/stocktakes/route.ts");
    expect(api).toContain("isLargeStocktakeDiff");
    expect(api).toContain("STOCKTAKE_LARGE_DIFF_NOTE_MIN");
    const ui = read("src/components/lab-supplies-stocktake.tsx");
    expect(ui).toContain("isLargeStocktakeDiff");
    expect(ui).toContain("needNote");
  });
});

describe("mở lại kỳ đã chốt", () => {
  const sql = read("supabase/migrations/20261202000004_lab_supplies_reopen_period_v1.sql");
  it("migration: lưu vết bất biến, chỉ xóa qua RPC (cờ cục bộ), UPDATE vẫn bị chặn, chỉ service_role", () => {
    expect(sql).toContain("lab_supply_period_reopenings");
    expect(sql).toContain("lab_supply_reopenings_immutable");
    expect(sql).toContain("tg_op = 'DELETE' and coalesce(current_setting('qlcl.lab_supply_reopen', true), '') = 'on'");
    expect(sql).toContain("char_length(btrim(coalesce(p_reason, ''))) < 5");
    expect(sql).toContain("order by period_end desc limit 1");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/grant execute on function public\.qlcl_lab_supply_reopen_period_v1\(uuid, uuid, text\) to service_role/);
    expect(sql).toMatch(/revoke execute on function public\.qlcl_lab_supply_reopen_period_v1\(uuid, uuid, text\) from public, anon, authenticated/);
  });
  it("route: cần lab_supplies.manage, bắt buộc lý do, ghi audit", () => {
    const route = read("src/app/api/lab-supplies/closings/reopen/route.ts");
    expect(route).toContain('labSuppliesContext("lab_supplies.manage")');
    expect(route).toContain("reason.length < 5");
    expect(route).toContain("LAB_SUPPLY_REOPEN_PERIOD");
  });
  it("giao diện có nút mở lại kỳ và không còn nói chốt kỳ 'không hoàn tác được'", () => {
    const ui = read("src/components/lab-supplies-stocktake.tsx");
    expect(ui).toContain("/api/lab-supplies/closings/reopen");
    expect(ui).toContain("Mở lại kỳ");
    expect(ui).not.toContain("không hoàn tác được");
    expect(read("src/components/lab-supplies-guide.tsx")).not.toContain("không hoàn tác");
  });
});

describe("giữ nháp phiếu khi đổi tab", () => {
  it("tab nhập, xuất, kiểm kê đã mở một lần thì chỉ ẩn, không hủy dựng", () => {
    const c = read("src/components/lab-supplies-client.tsx");
    expect(c).toContain("visited.has(key)");
    for (const k of ["receipt", "issue", "stocktake"]) expect(c).toContain(`keep("${k}")`);
    expect(c).toContain("display: \"none\"");
  });
});
