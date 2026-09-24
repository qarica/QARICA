import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA narrative dictation", () => {
  it("uses reusable dictation for long CAPA narrative fields", () => {
    const source=readFileSync("src/components/capa-workflow-client.tsx","utf8");
    expect(source).toContain('import { DictationTextarea }');
    expect((source.match(/<DictationTextarea/g)||[]).length).toBeGreaterThanOrEqual(5);
    expect(source).toContain("onValueChange={setResources}");
    expect(source).toContain("onValueChange={setConclusion}");
    expect(source).toContain("onValueChange={setTarget}");
    expect(source).toContain("onValueChange={setActual}");
    expect(source).toContain("onValueChange={setComment}");
  });
});
