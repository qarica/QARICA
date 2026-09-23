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
    it(`${href} resolves to an app page or workspace directory`, () => {
      const page = `src/app/(app)${href === "/" ? "" : href}/page.tsx`;
      const workspaceDir = `src/app/(app)${href}`;
      expect(existsSync(page) || existsSync(workspaceDir)).toBe(true);
    });
  }
});
