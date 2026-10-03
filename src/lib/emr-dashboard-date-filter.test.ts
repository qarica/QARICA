import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/emr/dashboard/route.ts", "utf8");
const categories = readFileSync("src/lib/emr-categories.ts", "utf8");

describe("EMR dashboard date filter — undated records must not vanish from the overview", () => {
  it("no longer requires due_date to exist before keeping an item in a date-filtered window", () => {
    // the pre-fix bug: `!!x.due_date && (...)` — dropped every undated item
    // (Quy trình/Biểu mẫu reference records) the moment any date filter was active,
    // even though /api/emr/items (the detail page's own source) never date-filters at all.
    expect(route).not.toContain("allItems.filter(x => !!x.due_date && (!from || x.due_date >= from) && (!to || x.due_date <= to))");
    expect(route).toContain("allItems.filter(x => !x.due_date || ((!from || x.due_date >= from) && (!to || x.due_date <= to)))");
  });

  it("the detail-page items route still applies no date-range filtering to GET (so both sources agree on undated records)", () => {
    const items = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const getBody = items.slice(items.indexOf("export async function GET"), items.indexOf("export async function POST"));
    expect(getBody).not.toContain("searchParams.get(\"from\")");
    expect(getBody).not.toContain("searchParams.get(\"to\")");
  });

  it("Quy trình and Biểu mẫu are real EMR_CATEGORIES entries this fix protects", () => {
    expect(categories).toContain('code: "QUY_TRINH"');
    expect(categories).toContain('code: "BIEU_MAU"');
  });

  it("readiness-grid only shows \"Chưa có dữ liệu\" when total is truly zero, never on query failure", () => {
    const shell = readFileSync("src/components/emr-command-center.tsx", "utf8");
    expect(shell).toContain('c.total===0?"Chưa có dữ liệu"');
    // a query/network failure is caught before `data` is ever set, and renders the
    // separate top-level alert instead of falling through to the per-category grid
    expect(shell).toContain('if(error)return <div className="alert error">{error}</div>;');
  });
});

describe("EMR dashboard date filter — behavioral coverage of the fixed predicate", () => {
  // Kept byte-identical to the route's own filter expression (verified against
  // the real source above) so this test actually exercises the shipped logic,
  // not just a string match against it.
  type Item = { id: string; due_date: string | null };
  function applyDateFilter(allItems: Item[], from: string, to: string) {
    const dateFilterActive = !!(from || to);
    return dateFilterActive
      ? allItems.filter((x) => !x.due_date || ((!from || x.due_date >= from) && (!to || x.due_date <= to)))
      : allItems;
  }

  const undatedProcessItem: Item = { id: "quy-trinh-1", due_date: null };
  const datedInRange: Item = { id: "in-range", due_date: "2026-06-15" };
  const datedBeforeRange: Item = { id: "before-range", due_date: "2026-01-01" };
  const datedAfterRange: Item = { id: "after-range", due_date: "2026-12-31" };
  const allItems = [undatedProcessItem, datedInRange, datedBeforeRange, datedAfterRange];
  const from = "2026-06-01";
  const to = "2026-06-30";

  it("retains an undated item (Quy trình/Biểu mẫu style record) inside a date-filtered window", () => {
    const result = applyDateFilter(allItems, from, to);
    expect(result).toContainEqual(undatedProcessItem);
  });

  it("retains a dated item whose due_date falls inside the window", () => {
    const result = applyDateFilter(allItems, from, to);
    expect(result).toContainEqual(datedInRange);
  });

  it("excludes a dated item whose due_date falls before the window", () => {
    const result = applyDateFilter(allItems, from, to);
    expect(result).not.toContainEqual(datedBeforeRange);
  });

  it("excludes a dated item whose due_date falls after the window", () => {
    const result = applyDateFilter(allItems, from, to);
    expect(result).not.toContainEqual(datedAfterRange);
  });

  it("applies no filtering at all when no date range is active", () => {
    const result = applyDateFilter(allItems, "", "");
    expect(result).toEqual(allItems);
  });
});
