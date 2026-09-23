import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dynamic evidence image lint exceptions", () => {
  for (const path of [
    "src/app/(app)/monitoring/[id]/page.tsx",
    "src/components/five-s-checklist-run-client.tsx",
    "src/components/monitoring-recheck-client.tsx",
  ]) {
    it(`${path} documents why raw img is required`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("@next/next/no-img-element");
      expect(source).toContain("Evidence previews use authenticated API/blob URLs");
    });
  }
});
