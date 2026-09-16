import { describe, expect, it } from "vitest";
import { booleanValue, canEditQualityRecord, cleanOptionalText, cleanRequiredText } from "./quality-record-edit";

describe("quality record edit rules", () => {
  it("keeps Finding editable before verification and locks submitted/closed states", () => {
    expect(canEditQualityRecord("FINDING", "OPEN")).toBe(true);
    expect(canEditQualityRecord("FINDING", "RETURNED")).toBe(true);
    expect(canEditQualityRecord("FINDING", "EVIDENCE_SUBMITTED")).toBe(false);
    expect(canEditQualityRecord("FINDING", "CLOSED")).toBe(false);
  });

  it("allows CAPA edits only while draft", () => {
    expect(canEditQualityRecord("CAPA", "DRAFT")).toBe(true);
    expect(canEditQualityRecord("CAPA", "PENDING_APPROVAL")).toBe(false);
    expect(canEditQualityRecord("CAPA", "ROOT_CAUSE_ANALYSIS")).toBe(false);
  });

  it("allows Risk edits only before the first assessment", () => {
    expect(canEditQualityRecord("RISK", "IDENTIFIED")).toBe(true);
    expect(canEditQualityRecord("RISK", "ASSESSED")).toBe(false);
    expect(canEditQualityRecord("RISK", "MONITORING")).toBe(false);
  });

  it("normalizes optional, required and boolean form values", () => {
    expect(cleanOptionalText("  ")).toBeNull();
    expect(cleanOptionalText("  abc  ")).toBe("abc");
    expect(cleanRequiredText("  abc  ")).toBe("abc");
    expect(booleanValue("true")).toBe(true);
    expect(booleanValue(false)).toBe(false);
  });
});
