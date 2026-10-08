import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const categories = readFileSync("src/lib/emr-categories.ts", "utf8");

// Regression for an explicit user request: "Đưa tất cả các nút menu con của
// emr về thành nút con trong thanh master thay cho thanh trượt ngang" — EMR's
// 11 destinations (Tổng quan EMR + Timeline + 9 EMR_CATEGORIES) used to live
// in their own horizontally-scrollable strip (EmrWorkspaceNav, rendered atop
// every EMR page) because the sidebar's "digital-systems" group deliberately
// held only 1 child. That strip is now removed; all 11 destinations are
// individual rows in the main sidebar's "digital-systems" accordion group
// instead, generated from the same EMR_CATEGORIES array (single source of
// truth — also used by the EMR dashboard readiness grid).
describe("EMR navigation — 11 destinations reachable from the main sidebar (no separate workspace-nav strip)", () => {
  it("expands the digital-systems group to exactly Tổng quan EMR + Timeline + the 9 real EMR_CATEGORIES", () => {
    expect(navigation).toContain('import { EMR_CATEGORIES } from "@/lib/emr-categories";');
    expect(navigation).toContain('{ label: "Tổng quan EMR", href: "/emr", icon: "layout-dashboard", permission: "emr.view" }');
    expect(navigation).toContain('{ label: "Timeline", href: "/emr/timeline", icon: "chart-spline", permission: "emr.view" }');
    expect(navigation).toContain('...EMR_CATEGORIES.map((c) => ({ label: c.label, href: `/emr/${c.slug}`, icon: c.icon, permission: "emr.view" }))');
    const codeCount = (categories.match(/code: "[A-Z_]+"/g) ?? []).length;
    expect(codeCount).toBe(9);
  });

  it("every generated EMR child route requires emr.view, matching the strip it replaced", () => {
    // 2 hardcoded entries (Tổng quan EMR, Timeline) + 1 inside the
    // EMR_CATEGORIES.map(...) template that applies it to all 9 categories.
    expect(navigation.match(/permission: "emr\.view"/g)?.length).toBe(3);
  });

  it("the horizontal EmrWorkspaceNav strip component no longer exists", () => {
    expect(() => readFileSync("src/components/emr-workspace-nav.tsx", "utf8")).toThrow();
  });

  it("no EMR page imports or renders the removed EmrWorkspaceNav strip", () => {
    const pages = [
      "src/components/emr-command-center.tsx",
      "src/app/(app)/emr/timeline/page.tsx",
      "src/app/(app)/emr/bieu-mau/nhom-gay/page.tsx",
      "src/app/(app)/emr/bieu-mau/tree/page.tsx",
      "src/app/(app)/emr/[category]/page.tsx",
    ];
    for (const path of pages) {
      const content = readFileSync(path, "utf8");
      expect(content).not.toContain("EmrWorkspaceNav");
    }
  });
});
