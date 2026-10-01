import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: "Menu EMR chưa có chổ nhập timeline và
// sơ đồ gantt" — EMR had no timeline/Gantt view. Reuses the existing TqmGantt
// component (already used by Dashboard/Plans/Improvement Projects) rather
// than building a second Gantt implementation, and reuses the existing
// emr_rollout_items created_at/due_date fields rather than adding new
// schema just to plot a chart.
describe("EMR Timeline & Gantt page", () => {
  const page = readFileSync("src/app/(app)/emr/timeline/page.tsx", "utf8");

  it("reuses the existing TqmGantt component instead of a new chart implementation", () => {
    expect(page).toContain('import { TQM_CHART_CSS, TqmGantt } from "@/components/tqm-charts";');
    expect(page).toContain("<TqmGantt year={year} rows={rows} />");
  });

  it("enforces emr.view permission like every other EMR page", () => {
    expect(page).toContain('requirePermission(user, "emr.view");');
  });

  it("maps real emr_rollout_items fields (created_at as start, due_date as end, status-derived progress/tone) — no fabricated timeline data", () => {
    expect(page).toContain(".select(\"id,category,title,status,due_date,created_at\")");
    expect(page).toContain("start: String(item.created_at).slice(0, 10)");
    expect(page).toContain("end: item.due_date");
    expect(page).toContain("STATUS_PROGRESS[item.status] ?? 0");
  });

  it("is reachable from EMR's workspace nav", () => {
    const nav = readFileSync("src/components/emr-workspace-nav.tsx", "utf8");
    expect(nav).toContain('{ slug: "timeline", label: "Timeline", icon: "chart-spline" }');
  });
});
