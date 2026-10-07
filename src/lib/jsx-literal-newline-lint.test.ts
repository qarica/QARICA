import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Real bug found by a full-app review: plan-print-actions.tsx and
// plans/[id]/page.tsx (Gantt section) had the literal two-character escape
// sequence "\n" (backslash + n, not an actual newline) typed directly between
// JSX elements — it rendered as visible "\n" text in the browser instead of
// being collapsed as whitespace. Scan every .tsx file once so this exact
// class of bug (likely from a prior compress/concat step gone wrong) can't
// silently reappear anywhere else.
const JSX_LITERAL_NEWLINE = /(<\/[A-Za-z][\w.]*>|\}\}>|">)\\n\s*</;

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

describe("no literal backslash-n escape sequences typed directly in JSX", () => {
  it("plan-print-actions.tsx and plans/[id]/page.tsx no longer contain the literal \\n bug", () => {
    expect(readFileSync("src/components/plan-print-actions.tsx", "utf8")).not.toMatch(JSX_LITERAL_NEWLINE);
    expect(readFileSync("src/app/(app)/plans/[id]/page.tsx", "utf8")).not.toMatch(JSX_LITERAL_NEWLINE);
  });

  it("no .tsx file in src/app or src/components contains the pattern", () => {
    const offenders: string[] = [];
    for (const file of [...collectTsxFiles("src/app"), ...collectTsxFiles("src/components")]) {
      const source = readFileSync(file, "utf8");
      if (JSX_LITERAL_NEWLINE.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
