import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: the "Tiêu đề" column header in every
// EMR category's item table (src/components/emr-category-client.tsx) should
// be clickable to sort by STT (the API's own creation order, as loaded) or
// alphabetically — cycling STT -> A-Z -> Z-A on each click.
describe("EMR item table — sortable Tiêu đề column (STT / alphabetical)", () => {
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("cycles through default (STT) -> asc -> desc -> default on click", () => {
    expect(client).toContain('useState<"default" | "asc" | "desc">("default")');
    expect(client).toContain('s === "default" ? "asc" : s === "asc" ? "desc" : "default"');
  });

  it("sorts by title using Vietnamese locale comparison (so diacritics order correctly), not a plain byte sort", () => {
    expect(client).toContain('a.title.localeCompare(b.title, "vi")');
    expect(client).toContain('b.title.localeCompare(a.title, "vi")');
  });

  it("leaves the default (non-sorted) order exactly as the API returns it — no sort applied when titleSort is \"default\"", () => {
    expect(client).toMatch(/if \(titleSort === "default"\) return rows;/);
  });

  it("the Tiêu đề header is a clickable control, not inert text, and shows the current sort direction", () => {
    expect(client).toContain("onClick={cycleTitleSort}");
    expect(client).toContain('titleSort==="asc"?"▲":titleSort==="desc"?"▼":"⇅"');
  });
});
