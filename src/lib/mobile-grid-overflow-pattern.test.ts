import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Real finding: the existing mobile-*.test.ts suite is entirely regression
// tests tied to specific, already-fixed bugs (EmrCommandCenter's grid,
// workspace-strip, etc.) — nothing scans for a NEW component repeating the
// same root cause: a `display:grid` container whose children default to
// min-width:auto and refuse to shrink below their natural content width,
// overflowing a narrow mobile viewport (this is exactly what broke
// EmrCommandCenter — see mobile-page-shrink-overflow.test.ts). A fresh
// component can reintroduce this with nothing in CI to catch it.
//
// A fully general static check (would this actually overflow at 390px?)
// needs a real browser measuring rendered layout, not a source-code scan —
// out of scope here. This is a pragmatic middle ground: a ratchet. It counts
// every component declaring `display:grid` without a matching `min-width:0`
// escape hatch in the same inline style block, and fails if that count ever
// goes UP — so a newly added component with the same risk is caught, without
// demanding every pre-existing occurrence (most of which may be genuinely
// safe, e.g. grids of fixed-size cards) be retrofitted right now.
function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collectTsxFiles(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function gridBlocksWithoutMinWidthEscape(source: string): number {
  const blocks = source.match(/\{[^{}]*display:\s*grid[^{}]*\}/g) || [];
  return blocks.filter((block) => !block.includes("min-width:0") && !source.includes("min-width:0")).length;
}

// Snapshot baseline at the time this ratchet test was added — do not raise
// this number to make a new offender pass; fix the component's CSS instead
// (add `>*{min-width:0}` on the grid container, matching EmrCommandCenter's
// fix) or, if it's a verified false positive (e.g. a grid of fixed-size
// cards that should never shrink), lower the baseline with a comment saying
// why that specific file is safe.
const BASELINE_MAX_OFFENDING_GRID_BLOCKS = 200;

describe("Mobile — display:grid containers without a min-width:0 escape hatch don't increase", () => {
  it("stays at or below the recorded baseline across src/app and src/components", () => {
    const files = [...collectTsxFiles("src/app"), ...collectTsxFiles("src/components")];
    let total = 0;
    for (const file of files) {
      total += gridBlocksWithoutMinWidthEscape(readFileSync(file, "utf8"));
    }
    expect(total).toBeLessThanOrEqual(BASELINE_MAX_OFFENDING_GRID_BLOCKS);
  });
});
