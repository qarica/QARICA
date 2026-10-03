import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navComponent = readFileSync("src/components/emr-workspace-nav.tsx", "utf8");
const overviewPage = readFileSync("src/components/emr-command-center.tsx", "utf8");
const categoryPage = readFileSync("src/app/(app)/emr/[category]/page.tsx", "utf8");
const timelinePage = readFileSync("src/app/(app)/emr/timeline/page.tsx", "utf8");
const categories = readFileSync("src/lib/emr-categories.ts", "utf8");

describe("EMR workspace navigation — 11 destinations reachable on every device", () => {
  // NHAP_LIEU was removed and TAI_LIEU_HUONG_DAN was added afterwards at
  // explicit user request — see emr-nhap-lieu-removal.test.ts and
  // emr-nav-order.test.ts. 9 real categories + overview + Timeline = 11.
  it("exposes exactly 11 destinations: Tổng quan EMR + the 9 real EMR_CATEGORIES + Timeline", () => {
    expect(navComponent).toContain('{ slug: "", label: "Tổng quan EMR"');
    expect(navComponent).toContain("...EMR_CATEGORIES.map(");
    expect(navComponent).toContain('{ slug: "timeline", label: "Timeline"');
    const codeCount = (categories.match(/code: "[A-Z_]+"/g) ?? []).length;
    expect(codeCount).toBe(9);
  });

  it("is wired into the EMR overview, every category detail page, and the timeline page (same component, no drift between them)", () => {
    expect(overviewPage).toContain("<EmrWorkspaceNav");
    expect(overviewPage).toContain('import { EmrWorkspaceNav } from "@/components/emr-workspace-nav";');
    expect(categoryPage).toContain("<EmrWorkspaceNav");
    expect(timelinePage).toContain("<EmrWorkspaceNav");
  });

  it("scrolls horizontally instead of wrapping into a multi-row/accordion block", () => {
    expect(navComponent).toContain("overflow-x:auto");
    expect(navComponent).not.toMatch(/flex-wrap:\s*wrap/);
  });

  it("does not introduce a second hamburger or a nested per-item accordion", () => {
    expect(navComponent).not.toContain("hamburger");
    expect(navComponent).not.toContain("toggleGroup");
    expect(navComponent).not.toContain("expandedGroupId");
  });

  it("touch targets meet the ~44px minimum on mobile", () => {
    const mediaBlockStart = navComponent.indexOf("@media(max-width:760px)");
    expect(mediaBlockStart).toBeGreaterThanOrEqual(0);
    const mediaBlock = navComponent.slice(mediaBlockStart);
    expect(mediaBlock).toContain("min-height:44px");
  });

  it("auto-scrolls the active destination into view on navigation", () => {
    expect(navComponent).toContain("scrollIntoView");
    expect(navComponent).toContain("useEffect(() => {");
  });

  it("resolves exactly one active destination per route (no dual-active)", () => {
    expect(navComponent).toContain('const active = pathname === href;');
  });
});
