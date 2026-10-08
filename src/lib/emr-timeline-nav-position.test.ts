import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit user request: "Menu timeline dời về sau tổng
// quan emr" — Timeline sits right after "Tổng quan EMR" and before the
// category list. Originally enforced on EmrWorkspaceNav's own DESTINATIONS
// array; that horizontal-strip component was removed per a later explicit
// request ("Đưa tất cả các nút menu con của emr về thành nút con trong
// thanh master thay cho thanh trượt ngang") and its 11 destinations now
// render as individual sidebar rows generated directly in navigation.ts —
// the ordering guarantee moves with it, onto the same source array.
describe("EMR sidebar nav — Timeline sits right after Tổng quan EMR", () => {
  it("declares Timeline as the 2nd child, before ...EMR_CATEGORIES.map(...)", () => {
    const nav = readFileSync("src/lib/navigation.ts", "utf8");
    const overviewIdx = nav.indexOf('{ label: "Tổng quan EMR"');
    const timelineIdx = nav.indexOf('{ label: "Timeline"');
    const categoriesIdx = nav.indexOf("...EMR_CATEGORIES.map(");
    expect(overviewIdx).toBeGreaterThan(-1);
    expect(timelineIdx).toBeGreaterThan(overviewIdx);
    expect(categoriesIdx).toBeGreaterThan(timelineIdx);
  });
});
