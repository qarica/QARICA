import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function hrefsFrom(file: string) {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:href|root):\s*"(\/[^"]*)"/g)].map((match) => match[1].split("?")[0]);
}

describe("navigation route existence", () => {
  const hrefs = Array.from(new Set([
    ...hrefsFrom("src/lib/navigation.ts"),
    ...hrefsFrom("src/lib/workspace-navigation.ts"),
  ]));

  it("has at least the expected workspace/navigation breadth", () => {
    expect(hrefs.length).toBeGreaterThanOrEqual(25);
  });

  for (const href of hrefs) {
    // Real finding: the old assertion accepted a bare directory with no
    // page.tsx of its own (existsSync(workspaceDir)) as "resolves" — a menu
    // href pointing at such a directory still 404s when clicked. A direct
    // nav href must have its own page.tsx, not just a directory that happens
    // to exist because nested routes live under it.
    it(`${href} resolves to a real page.tsx, not just a directory`, () => {
      const page = `src/app/(app)${href === "/" ? "" : href}/page.tsx`;
      expect(existsSync(page)).toBe(true);
    });
  }
});
