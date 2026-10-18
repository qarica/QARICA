import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report (phone screenshot): right after tapping the "Việc của tôi"
// topbar icon to navigate to /tasks, that icon kept a light-blue tinted
// background while the other topbar icons (calendar, notebook, bell)
// stayed plain white — a lingering focus/active style, not an intentional
// .header-icon.active design (nothing in the codebase ever styled that
// combination with a tint). Neutralized in final-visual-lock.css (loaded
// last) without touching the universal *:focus-visible outline ring kept
// for keyboard navigation.
describe("Topbar header-icon launchers: no lingering tint on .active/:focus after SPA navigation", () => {
  it("final-visual-lock.css resets .header-icon.active/:focus/:focus-visible back to the neutral white style", () => {
    const css = readFileSync("src/app/final-visual-lock.css", "utf8");
    expect(css).toContain(".workspace-app .header-icon.active,\n.workspace-app .header-icon:focus,\n.workspace-app .header-icon:focus-visible{background:#fff!important;border-color:var(--qf-line)!important;color:#475569!important;box-shadow:none!important}");
  });

  it("does not disable the universal keyboard focus-visible outline ring", () => {
    const css = readFileSync("src/app/workspace-shell.css", "utf8");
    expect(css).toContain(".workspace-app *:focus-visible {");
    expect(css).toContain("outline: 2px solid var(--focus) !important;");
  });
});
