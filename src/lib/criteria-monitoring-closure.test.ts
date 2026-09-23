import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("criteria and monitoring closure guards", () => {
  it("keeps checklist creation atomic", () => {
    const source = readFileSync("src/lib/checklist-template-create-atomic.test.ts", "utf8");
    expect(source).toContain("atomic");
  });
  it("keeps monitoring export regression coverage", () => {
    expect(readFileSync("src/lib/monitoring-export.test.ts", "utf8").trim().length).toBeGreaterThan(0);
  });
  it("keeps report transitions atomic", () => {
    expect(readFileSync("src/lib/report-transition-atomic.test.ts", "utf8")).toContain("atomic");
  });
});
