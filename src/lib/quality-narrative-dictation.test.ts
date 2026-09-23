import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality workflow narrative UX", () => {
  const fmea = readFileSync("src/components/fmea-workflow-client.tsx","utf8");
  const risk = readFileSync("src/components/risk-workflow-client.tsx","utf8");
  const inspection = readFileSync("src/components/inspection-workflow-client.tsx","utf8");

  it("removes browser prompts from FMEA and Risk terminal notes", () => {
    expect(fmea).not.toContain("window.prompt");
    expect(risk).not.toContain("window.prompt");
  });

  it("uses reusable dictation for FMEA, Risk and Inspection narratives", () => {
    expect(fmea).toContain("DictationTextarea");
    expect(risk).toContain("DictationTextarea");
    expect(inspection).toContain("DictationTextarea");
  });
});
