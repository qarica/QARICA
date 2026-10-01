import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: "Menu EMR chưa có chổ nhập timeline và
// sơ đồ gantt" — EMR had no timeline/Gantt view. Reuses the existing TqmGantt
// component (already used by Dashboard/Plans/Improvement Projects) rather
// than building a second Gantt implementation, and reuses the existing
// emr_rollout_items created_at/due_date fields rather than adding new
// schema just to plot a chart.
//
// Follow-up correction: the first version plotted one Gantt row PER ITEM
// (one row per Biểu mẫu, Lỗi, etc.) — with 80+ forms this was unusable. The
// user asked for "đầu mục timeline lớn chứ không theo từng biểu mẫu", giving
// a real project Excel as the shape to match (top-level work-stream rows:
// Hạ tầng, Thiết bị y tế, Chữ ký số, Đào tạo, Biểu mẫu...). Rolled up to one
// row per EMR_CATEGORY instead — the same generic, non-hardcoded structure
// already used everywhere else in the EMR module (CLAUDE.md principle: don't
// hard-code one hospital's project plan as if it were the business
// structure) — with progress = done/total and start/end spanning the
// group's items.
describe("EMR Timeline & Gantt page", () => {
  const page = readFileSync("src/app/(app)/emr/timeline/page.tsx", "utf8");

  it("reuses the existing TqmGantt component instead of a new chart implementation", () => {
    expect(page).toContain('import { TQM_CHART_CSS, TqmGantt } from "@/components/tqm-charts";');
    expect(page).toContain("<TqmGantt year={year} rows={rows} />");
  });

  it("enforces emr.view permission like every other EMR page", () => {
    expect(page).toContain('requirePermission(user, "emr.view");');
  });

  it("rolls up rows by EMR_CATEGORY (the generic category structure) instead of one row per item", () => {
    expect(page).toContain("const rows = EMR_CATEGORIES.map((c) => {");
    expect(page).toContain('const group = items.filter((x: any) => x.category === c.code);');
    expect(page).not.toContain("item.title");
  });

  it("derives progress from done/total and the date range from the group's own created_at/due_date — no fabricated timeline data", () => {
    expect(page).toContain("const progress = Math.round((done / group.length) * 100);");
    expect(page).toContain("starts[0] || null");
    expect(page).toContain("dueDates[dueDates.length - 1] || null");
  });

  it("drops empty categories instead of plotting zero-item rows", () => {
    expect(page).toContain(".filter((r) => r.count > 0)");
  });

  it("is reachable from EMR's workspace nav", () => {
    const nav = readFileSync("src/components/emr-workspace-nav.tsx", "utf8");
    expect(nav).toContain('{ slug: "timeline", label: "Timeline", icon: "chart-spline" }');
  });
});
