import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment and audit workflow note UX", () => {
  const files = [
    "src/components/assessment-workflow-client.tsx",
    "src/components/audit-workflow-client.tsx",
    "src/components/external-assessment-workflow-client.tsx",
  ];
  it("does not use browser prompts", () => {
    for (const file of files) expect(readFileSync(file,"utf8")).not.toContain("window.prompt");
  });
  it("uses reusable dictation for narrative notes", () => {
    for (const file of files) expect(readFileSync(file,"utf8")).toContain("DictationTextarea");
  });
});
