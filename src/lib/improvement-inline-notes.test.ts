import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("improvement workflow inline notes", () => {
  const project = readFileSync("src/components/improvement-project-workflow-client.tsx","utf8");
  const proposal = readFileSync("src/components/improvement-proposal-workflow-client.tsx","utf8");

  it("removes browser prompts from improvement workflows", () => {
    expect(project).not.toContain("window.prompt");
    expect(proposal).not.toContain("window.prompt");
  });

  it("uses reusable dictation for long-form review notes", () => {
    expect(project).toContain("DictationTextarea");
    expect(proposal).toContain("DictationTextarea");
  });
});
