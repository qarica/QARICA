import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/app-shell.tsx", "utf8");

// Regression for a real, screenshotted bug: collapsing the sidebar hid
// .nav-link-label (child links) but NOT .nav-group-label (group header
// text), so a group header like "ĐIỀU HÀNH CHẤT LƯỢNG" kept rendering its
// full multi-word label inside the narrow 76px collapsed rail, wrapping
// across several lines and overlapping the icon.
describe("sidebar collapsed state hides group header labels too", () => {
  it("adds .nav-group-label to the collapsed-state hide list alongside .nav-link-label", () => {
    expect(shell).toContain(".workspace-app .sidebar.collapsed .sidebar-brand-copy,.workspace-app .sidebar.collapsed .nav-label,.workspace-app .sidebar.collapsed .nav-link-label,.workspace-app .sidebar.collapsed .nav-group-label,.workspace-app .sidebar.collapsed .sidebar-bottom{display:none}");
  });

  // Regression: the footer (scope chip + collapse button) previously lived
  // inside the scrollable .sidebar-nav flow (as the last child after the nav
  // groups), so its vertical position jumped depending on how many menu
  // items were rendered/expanded. Moved it into a single .sidebar-bottom
  // wrapper pinned to the bottom of the sidebar, so it never moves regardless
  // of menu length.
  it("pins the footer to the bottom of the sidebar via a dedicated wrapper, not sidebar-nav's scroll flow", () => {
    expect(shell).toContain('.workspace-app .sidebar-bottom{position:absolute;left:0;right:0;bottom:0;background:#fff}');
    expect(shell).toContain('.workspace-app .sidebar-footer{position:static;');
    expect(shell).toMatch(/<\/nav>\s*<div className="sidebar-bottom">/);
  });

  // Explicit request: remove the decorative hospital-building illustration
  // that used to sit above the footer (scope chip + collapse button).
  it("no longer renders the hospital-building illustration", () => {
    expect(shell).not.toContain("sidebar-illustration");
    expect(shell).not.toContain("sbHospBody");
  });
});

// Real, screenshotted bug: collapsing the desktop sidebar made every
// single-child group (AUDIT HSBA, THEO DÕI HÀNH NGHỀ, QUẢN LÝ CÔNG VĂN,
// KIỂM SOÁT TÀI LIỆU, ĐÀO TẠO QUY TRÌNH, MUA SẮM & SỬA CHỮA, CẤU HÌNH HỆ
// THỐNG) show a completely blank icon — only the 2-3 groups rendered as a
// real accordion (<button class="nav-group-header">) kept their icon.
// Root cause, found by rendering the real markup + every loaded global CSS
// file in a headless browser and inspecting computed styles: qlvb-theme.css
// (a legacy "QLVB-style shell" stylesheet predating the icon+label split)
// has `.sidebar.collapsed .nav-link span{display:none!important}` — it
// meant to hide just the text label, but `renderChild()`'s single-child
// promoted link (`<Link class="nav-link nav-group-link">`) wraps its icon
// in a `<span class="nav-icon ...">` too, which is ALSO a `span` inside
// `.nav-link` — so the blanket `span` selector hid the icon wrapper itself
// (display:none, not just a color/size issue). renderGroup()'s accordion
// header uses a `<button class="nav-group-header">`, which never matches
// `.nav-link span` at all, which is why those groups' icons were unaffected.
describe("collapsed sidebar does not blank out single-child promoted links' icons (qlvb-theme.css)", () => {
  const qlvbTheme = readFileSync("src/app/qlvb-theme.css", "utf8");

  it("targets only the label span (.nav-link-label), not every span inside .nav-link — a bare 'span' selector also matches the icon-wrapping span", () => {
    expect(qlvbTheme).not.toContain(".nav-link span");
    expect(qlvbTheme).toContain(".sidebar.collapsed .sidebar-brand-copy,.sidebar.collapsed .nav-label,.sidebar.collapsed .nav-link-label,.sidebar.collapsed .sidebar-footer{display:none!important}");
  });

  it("keeps the matching mobile reset (display:flex) in sync with the same selector change", () => {
    expect(qlvbTheme).toContain(".sidebar.collapsed .sidebar-brand-copy,.sidebar.collapsed .nav-label,.sidebar.collapsed .nav-link-label,.sidebar.collapsed .sidebar-footer{display:flex!important}");
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
