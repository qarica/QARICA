import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("5S evidence upload policy", () => {
  it("derives safe image MIME from the evidence allowlist and uploads in bounded batches", () => {
    const source=readFileSync("src/app/api/monitoring/rounds/[id]/5s-results/route.ts","utf8");
    expect(source).toContain('evidenceFilePolicy(file.name || "")');
    expect(source).toContain("policy?.inlineSafe");
    expect(source).toContain("mime_type: entry.mimeType");
    expect(source).toContain("contentType: entry.mimeType");
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("offset += 4");
    expect(source).not.toContain("mime_type: file.type");
  });
});
