import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report (phone screenshot, recurring even after confirming a full
// reload): the "Việc của tôi" topbar icon kept a light-blue tinted
// background while on /tasks, while the other topbar icons (calendar,
// notebook, bell) stayed plain white. First attempt neutralized
// .header-icon.active/:focus/:focus-visible in final-visual-lock.css, but
// that changed nothing — because no CSS rule anywhere in the repo ever
// styled .header-icon.active with a tint in the first place, so resetting
// it was a no-op. The actual fix: stop attaching the "active" class to
// these 4 topbar icons at all (app-shell.tsx), whatever the real source of
// the tint turns out to be — it can no longer match these elements.
describe("Topbar header-icon launchers never carry an 'active' class", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("calendar-launcher, my-work-launcher, notebook-launcher and admin-launcher use a plain static className, not pathname.startsWith(...) ? \"active\" : \"\"", () => {
    expect(shell).toContain('className="icon-button header-icon calendar-launcher"');
    expect(shell).toContain('className="icon-button header-icon my-work-launcher"');
    expect(shell).toContain('className="icon-button header-icon notebook-launcher"');
    expect(shell).toContain('className="icon-button header-icon admin-launcher"');
  });

  it("no header-icon launcher className still computes an active/inactive ternary", () => {
    expect(shell).not.toMatch(/header-icon [a-z-]+-launcher \$\{pathname\.startsWith/);
  });

  it("final-visual-lock.css still neutralizes .header-icon:focus/:focus-visible as a second line of defense, without touching the universal keyboard focus-visible outline", () => {
    const finalLock = readFileSync("src/app/final-visual-lock.css", "utf8");
    expect(finalLock).toContain(".workspace-app .header-icon:focus,\n.workspace-app .header-icon:focus-visible{background:#fff!important;border-color:var(--qf-line)!important;color:#475569!important;box-shadow:none!important}");
    const workspaceShell = readFileSync("src/app/workspace-shell.css", "utf8");
    expect(workspaceShell).toContain(".workspace-app *:focus-visible {");
    expect(workspaceShell).toContain("outline: 2px solid var(--focus) !important;");
  });
});
