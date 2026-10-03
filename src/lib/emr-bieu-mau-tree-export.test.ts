import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression: the master form tree page (grouped by Nhóm gáy) must also be
// exportable to Excel, with rows grouped the same way the on-screen tree is
// — not a flat dump. Reuses the SAME export route every other EMR category
// already uses (via an optional groupBy param), rather than a second export
// implementation.
describe("EMR Biểu mẫu master tree — Excel export", () => {
  const treePage = readFileSync("src/app/(app)/emr/bieu-mau/tree/page.tsx", "utf8");
  const exportRoute = readFileSync("src/app/api/emr/items/export/route.ts", "utf8");

  it("the tree page links to the shared export route with groupBy=binding_group", () => {
    expect(treePage).toContain("href={`/api/emr/items/export?category=BIEU_MAU&groupBy=binding_group`}");
    expect(treePage).toContain(">Xuất Excel<");
  });

  it("the export route only groups by a real declared field of the category (never an arbitrary client-supplied column)", () => {
    expect(exportRoute).toContain('const groupByParam = searchParams.get("groupBy") || "";');
    expect(exportRoute).toContain("find((f) => f.key === groupByParam)");
  });

  it("falls back to the same 'Chưa phân nhóm' bucket name used by the on-screen tree, so the two views stay consistent", () => {
    expect(exportRoute).toContain('const UNGROUPED = "Chưa phân nhóm";');
  });

  it("inserts a group header row per group with the group's item count, then the ungrouped export path is unaffected (no groupBy = flat rows, same as every other category)", () => {
    expect(exportRoute).toContain("groups.get(name)!.length");
    expect(exportRoute).toContain("items.map((it: any, i: number) => rowHtml(it, i))");
  });
});
