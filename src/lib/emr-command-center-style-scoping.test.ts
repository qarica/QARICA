import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a recurring real bug report: the EMR overview page's KPI
// row, readiness grid, compliance list and escalation list kept showing up
// with no card chrome / inconsistent typography ("chữ xấu", "lệch icon")
// across multiple separate screenshots, well beyond the previously-fixed
// Kpi/Compliance icon-color case. Root cause: this file used <style jsx>,
// which only scopes CSS to elements written directly in the JSX of the
// component owning the tag — PanelHead/Kpi/Compliance are separate
// functions, so none of their card/typography rules ever matched. Fixed by
// dropping styled-jsx for this file entirely and switching to a plain
// <style> tag with every selector explicitly prefixed by `.emr-command `,
// matching the manual-scoping convention every other page in this codebase
// already uses (e.g. analytics/page.tsx's `.tqm-analytics` prefix) — this
// removes the whole bug class instead of patching one more discovered
// instance of it.
describe("EMR Command Center — dropped styled-jsx for plain, explicitly-scoped CSS", () => {
  const command = readFileSync("src/components/emr-command-center.tsx", "utf8");

  it("no longer uses <style jsx> anywhere in this file", () => {
    expect(command).not.toContain("<style jsx>");
  });

  it("uses a plain <style> tag instead", () => {
    expect(command).toContain("<style>{`");
  });

  it("every top-level selector that styles elements rendered by separate child components (Kpi/Compliance/PanelHead) is explicitly prefixed with .emr-command, not relying on styled-jsx scoping", () => {
    for (const selector of [
      ".emr-command .emr-kpi{",
      ".emr-command .emr-kpi-top{",
      ".emr-command .emr-kpi label{",
      ".emr-command .emr-kpi strong{",
      ".emr-command .emr-kpi small{",
      ".emr-command .emr-panel-head{",
      ".emr-command .emr-panel-head h2{",
      ".emr-command .emr-panel-head p{",
      ".emr-command .emr-compliance-row{",
      ".emr-command .emr-compliance-row label{",
    ]) {
      expect(command).toContain(selector);
    }
  });

  it("also prefixes this component's own directly-written markup (ready-card, action-list) for consistency — not just the previously-known child-component cases", () => {
    expect(command).toContain(".emr-command .ready-card{");
    expect(command).toContain(".emr-command .ready-icon{");
    expect(command).toContain(".emr-command .action-list{");
    expect(command).toContain(".emr-command .action-icon{");
  });

  it("keeps the already-correct inline icon-tone styling untouched (no churn on working code)", () => {
    expect(command).toContain("const KPI_TONE_COLORS: Record<string,{bg:string;color:string}> = {");
    expect(command).toContain('style={{...KPI_ICON_BASE_STYLE,background:c.bg,color:c.color}}');
  });
});
