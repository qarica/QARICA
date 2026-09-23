import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality attention notification de-duplication", () => {
  it("keeps deadline event keys stable when urgency phase changes", () => {
    const source = readFileSync("src/app/api/notifications/sync-quality-attention/route.ts", "utf8");
    expect(source).toContain("quality:directive:${row.id}:due:");
    expect(source).toContain("quality:report:${row.id}:due:");
    expect(source).toContain("quality:risk:${row.id}:review:");
    expect(source).toContain("quality:capa:${row.id}:effectiveness:");
    expect(source).toContain("quality:feedback:${row.id}:response:");
    expect(source).toContain("quality:inspection:${row.id}:visit:");
    expect(source).toContain("quality:finding:${row.id}:due:");
    expect(source).not.toContain("quality:feedback:${row.id}:${phase.phase}");
  });
});
