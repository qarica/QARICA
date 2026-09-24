import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("indicator period sync batching", () => {
  it("materializes candidate periods with bounded concurrency", () => {
    const source=readFileSync("src/app/api/indicators/sync-periods/route.ts","utf8");
    expect(source).toContain("const CONCURRENCY = 4");
    expect(source).toContain("candidates.slice(offset, offset + CONCURRENCY)");
    expect(source).toContain("Promise.all(batch.map(materialize))");
    expect(source).not.toContain("Tài khoản chưa gắn bệnh viện");
  });
});
