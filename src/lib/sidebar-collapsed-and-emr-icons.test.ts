import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");

// Regression for a real, screenshotted bug: collapsing the sidebar hid
// .nav-link-label (child links) but NOT .nav-group-label (group header
// text), so a group header like "ĐIỀU HÀNH CHẤT LƯỢNG" kept rendering its
// full multi-word label inside the narrow 76px collapsed rail, wrapping
// across several lines and overlapping the icon.
describe("sidebar collapsed state hides group header labels too", () => {
  it("adds .nav-group-label (and .sidebar-illustration) to the collapsed-state hide list alongside .nav-link-label", () => {
    expect(shell).toContain(".workspace-app .sidebar.collapsed .sidebar-brand-copy,.workspace-app .sidebar.collapsed .nav-label,.workspace-app .sidebar.collapsed .nav-link-label,.workspace-app .sidebar.collapsed .nav-group-label,.workspace-app .sidebar.collapsed .sidebar-footer,.workspace-app .sidebar.collapsed .sidebar-illustration{display:none}");
  });
});

// Regression for a real, screenshotted bug: EMR Command Center's 6 main KPI
// icons rendered with no colored badge at all (bare icon glyphs), unlike
// every other KPI row in the app (Tổng quan QLCL, Admin, Analytics). Root
// cause: Kpi/Compliance are separate function components rendered BY
// EmrCommandCenter, and styled-jsx only scopes CSS to elements written
// directly in the JSX of the component that owns the <style jsx> tag — a
// documented gotcha in this repo's CLAUDE.md. The .emr-kpi-icon CSS in the
// <style jsx> block compiled fine but never matched these elements at all,
// not even for sizing. Fix: style them inline instead of relying on scoped
// CSS, using the exact same flat-tint badge convention as Tổng quan QLCL's
// own .kpi-icon classes (not a gradient, and not reinventing the palette).
describe("EMR Command Center KPI icons — fixed styled-jsx child-component scoping bug", () => {
  const command = readFileSync("src/components/emr-command-center.tsx", "utf8");

  it("no longer defines dead .emr-kpi-icon / per-tone gradient rules in the scoped <style jsx> block (Kpi is a child component — this CSS never reached it)", () => {
    expect(command).not.toContain(".emr-command .emr-kpi-icon{");
    expect(command).not.toContain(".emr-command .emr-kpi.blue .emr-kpi-icon{background:linear-gradient");
    expect(command).not.toContain(".emr-compliance-icon{width:28px");
  });

  it("styles the KPI icon badge inline with the same flat-tint palette Tổng quan QLCL's .kpi-icon uses (not a gradient)", () => {
    expect(command).toContain('const KPI_TONE_COLORS: Record<string,{bg:string;color:string}> = {');
    expect(command).toContain('blue:{bg:"#dbeafe",color:"#2563eb"}');
    expect(command).toContain('green:{bg:"#dcfce7",color:"#16a34a"}');
    expect(command).toContain('purple:{bg:"#ede9fe",color:"#7c3aed"}');
    expect(command).toContain('red:{bg:"#fee2e2",color:"#dc2626"}');
  });

  it("applies the tone color via inline style on the icon span, matching Tổng quan QLCL's 40px/12px-radius badge size", () => {
    expect(command).toContain("const KPI_ICON_BASE_STYLE:CSSProperties={width:40,height:40,borderRadius:12");
    expect(command).toContain('style={{...KPI_ICON_BASE_STYLE,background:c.bg,color:c.color}}');
  });

  it("fixes the same scoping bug for Compliance's icon badge, not just Kpi's", () => {
    expect(command).toContain('style={{...KPI_ICON_BASE_STYLE,width:28,height:28,borderRadius:7,background:"#eaf8f2",color:"#17a675"}}');
  });
});
