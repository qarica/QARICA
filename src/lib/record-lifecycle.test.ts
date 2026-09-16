import { describe, expect, it } from "vitest";
import { canCancelIncident } from "./record-lifecycle";

describe("canCancelIncident", () => {
  it("allows the reporter to cancel their own newly reported incident", () => {
    expect(canCancelIncident({ hasClosePermission: false, hasTriagePermission: false, isReporter: true, workflowStatus: "REPORTED" })).toBe(true);
  });

  it("blocks the reporter after the incident has entered triage", () => {
    expect(canCancelIncident({ hasClosePermission: false, hasTriagePermission: false, isReporter: true, workflowStatus: "TRIAGED" })).toBe(false);
  });

  it("allows quality staff with triage permission", () => {
    expect(canCancelIncident({ hasClosePermission: false, hasTriagePermission: true, isReporter: false, workflowStatus: "TRIAGED" })).toBe(true);
  });

  it("allows incident closers throughout an active workflow", () => {
    expect(canCancelIncident({ hasClosePermission: true, hasTriagePermission: false, isReporter: false, workflowStatus: "INVESTIGATING" })).toBe(true);
  });
});
