import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Finding review narrative UX", () => {
  it("uses reusable dictation and keeps explicit submit", () => {
    const source = readFileSync("src/components/finding-workflow-client.tsx", "utf8");
    expect(source).toContain("DictationTextarea");
    expect(source).toContain("comment.trim()");
    expect(source).not.toContain("<textarea name=\"comment\"");
  });
});
