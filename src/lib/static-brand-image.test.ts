import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("static QARICA brand images", () => {
  for (const path of [
    "src/app/login/page.tsx",
    "src/components/app-shell.tsx",
    "src/components/login-form.tsx",
  ]) {
    it(`${path} uses Next Image instead of raw img for static brand assets`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('from "next/image"');
      expect(source).not.toMatch(/<img[^>]+\/brand\/qarica-/);
    });
  }
});
