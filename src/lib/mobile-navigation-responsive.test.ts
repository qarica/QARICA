import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile navigation responsive contract", () => {
  it("does not let desktop collapsed sidebar hide mobile drawer labels", () => {
    const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");
    expect(css).toContain(".workspace-app .sidebar.collapsed .sidebar-brand-copy");
    expect(css).toContain("display: flex !important");
    expect(css).toContain(".workspace-app .sidebar.collapsed .nav-link-label");
    expect(css).toContain("display: inline !important");
    expect(css).toContain(".workspace-app .sidebar-collapse");
    expect(css).toContain("display: none !important");
  });

  it("loads mobile overrides after the desktop theme stack", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const desktopTheme = layout.indexOf('import "./qms-enterprise-redesign.css";');
    const mobileFixes = layout.indexOf('import "./mobile-responsive-fixes.css";');
    expect(desktopTheme).toBeGreaterThanOrEqual(0);
    expect(mobileFixes).toBeGreaterThan(desktopTheme);
  });

  it("closes and locks the mobile drawer safely", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain("setMobileOpen(false); }, [pathname]");
    expect(shell).toContain('document.body.style.overflow = "hidden"');
    expect(shell).toContain('event.key === "Escape"');
  });

  it("keeps mobile page actions and tabs scrollable instead of squeezing desktop menus", () => {
    const css = readFileSync("src/app/mobile-responsive-fixes.css", "utf8");
    expect(css).toContain(".workspace-app .page-actions");
    expect(css).toContain("overflow-x: auto !important");
    expect(css).toContain(".workspace-app .tabs");
    expect(css).toContain(".workspace-app .modern-tabs");
  });
});
