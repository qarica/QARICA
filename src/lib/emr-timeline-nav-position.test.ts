import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit user request: "Menu timeline dời về sau tổng
// quan emr" — Timeline was appended at the end of the DESTINATIONS array
// (after all 9 categories); moved to come right after "Tổng quan EMR" and
// before the category list.
describe("EMR workspace nav — Timeline sits right after Tổng quan EMR", () => {
  it("declares Timeline as the 2nd destination, before ...EMR_CATEGORIES.map(...)", () => {
    const nav = readFileSync("src/components/emr-workspace-nav.tsx", "utf8");
    const overviewIdx = nav.indexOf('{ slug: "", label: "Tổng quan EMR"');
    const timelineIdx = nav.indexOf('{ slug: "timeline", label: "Timeline"');
    const categoriesIdx = nav.indexOf("...EMR_CATEGORIES.map(");
    expect(overviewIdx).toBeGreaterThan(-1);
    expect(timelineIdx).toBeGreaterThan(overviewIdx);
    expect(categoriesIdx).toBeGreaterThan(timelineIdx);
  });
});
