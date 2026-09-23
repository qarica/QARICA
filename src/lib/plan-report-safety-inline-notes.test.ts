import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Plan, Indicator, Report and Safety Alert inline notes", () => {
  const files = [
    "src/components/indicator-workflow-client.tsx",
    "src/components/plan-workflow-client.tsx",
    "src/components/report-workflow-client.tsx",
    "src/components/safety-alert-workflow-client.tsx",
  ];
  it("does not use browser prompts", () => {
    for (const file of files) expect(readFileSync(file,"utf8")).not.toContain("window.prompt");
  });
  it("uses reusable dictation for review notes", () => {
    for (const file of files) expect(readFileSync(file,"utf8")).toContain("DictationTextarea");
  });
});
