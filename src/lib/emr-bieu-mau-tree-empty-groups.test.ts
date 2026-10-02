import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit report: "có 1 số gáy đã khai báo nhưng chưa có
// biểu mẫu trong đó nên không hiện gáy trong cây biểu mẫu là chưa đúng" —
// the tree was built purely from `items` (forms), so a gáy declared in the
// catalog (emr_binding_groups) but not yet assigned to any form was
// invisible until its first form was assigned. Declared groups with zero
// items must still render, as an empty group ready to receive forms.
describe("EMR Biểu mẫu tree — a declared gáy with zero forms still shows up", () => {
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("seeds groupMap with every declared, still-active group name, not only names that already have an item", () => {
    expect(client).toContain("for (const g of groups) {");
    expect(client).toContain("if (g.is_active && !groupMap.has(g.name)) groupMap.set(g.name, []);");
  });

  it("the whole-page empty state only fires when there are neither items nor declared groups", () => {
    expect(client).toContain("if (!items.length && !groups.length) return <div className=\"empty-state\">Chưa có biểu mẫu nào để dựng cây.</div>;");
  });

  it("an empty gáy renders its table with a friendly empty row instead of a blank/broken-looking body", () => {
    expect(client).toContain("Chưa có biểu mẫu nào trong nhóm gáy này.");
  });
});
