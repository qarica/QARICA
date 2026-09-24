import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("monitoring latest-version query scope", () => {
  it("does not load all checklist sections/items just to count latest versions", () => {
    const source=readFileSync("src/app/(app)/monitoring/page.tsx","utf8");
    expect(source).toContain("const latestVersionIds");
    expect(source).toContain('.in("checklist_version_id", latestVersionIds)');
    expect(source.indexOf('from("checklist_sections")')).toBeGreaterThan(source.indexOf("latestVersionIds"));
  });
});
