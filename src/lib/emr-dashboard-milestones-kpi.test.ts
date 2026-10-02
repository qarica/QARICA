import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Follow-up to the Timeline đầu việc lớn/con feature: "các tác vụ nãy giờ
// mình làm nó có liên kết ra bản dashboard tổng quan EMR để theo dõi không
// em" — milestones (emr_timeline_milestones) were a fully separate table
// with zero visibility from Tổng quan EMR. Recommended and implemented as a
// SEPARATE KPI card, not folded into the main "Mức độ triển khai EMR" %
// (which measures the 9 fixed EMR_CATEGORIES and backs the Go-live gate) —
// mixing the two would make that gate's number impossible to audit, since
// milestones are freely declared, not a standardized checklist.
describe("Tổng quan EMR — Đầu việc dự án (Timeline) shown as its own KPI, not folded into completion%", () => {
  const route = readFileSync("src/app/api/emr/dashboard/route.ts", "utf8");
  const commandCenter = readFileSync("src/components/emr-command-center.tsx", "utf8");

  it("the dashboard route queries emr_timeline_milestones separately from emr_rollout_items", () => {
    expect(route).toContain('.from("emr_timeline_milestones")');
    expect(route).toContain('.select("id,status").eq("organization_id", profile.organization_id);');
  });

  it("milestone stats are returned as their own `milestones` field, not merged into `completion`/`counts`", () => {
    expect(route).toContain("const milestoneStats = { total: milestones.length, done: milestonesDone, completion: milestones.length ? Math.round(milestonesDone * 100 / milestones.length) : null };");
    expect(route).toContain("milestones: milestoneStats");
  });

  it("the command center renders a dedicated 'Đầu việc dự án' KPI card reading data.milestones, separate from the main completion KPI", () => {
    expect(commandCenter).toContain('milestones:{total:number;done:number;completion:number|null}');
    expect(commandCenter).toContain('label="Đầu việc dự án"');
    expect(commandCenter).toContain('value={data.milestones.total?`${data.milestones.done}/${data.milestones.total}`:"—"}');
  });

  it("the KPI grid grew to 7 columns to fit the new card without disturbing the existing 6", () => {
    expect(commandCenter).toContain(".emr-command .emr-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}");
  });
});
