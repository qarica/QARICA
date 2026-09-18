import { describe, expect, it } from "vitest";
import { getIncidentJourneyState } from "./incident-journey";

describe("incident journey", () => {
  it("routes a newly reported incident to triage", () => {
    const state = getIncidentJourneyState("REPORTED", { canTriage: true });
    expect(state.step).toBe(2);
    expect(state.targetId).toBe("incident-triage");
  });

  it("shows a waiting state to a reporter without triage permission", () => {
    const state = getIncidentJourneyState("REPORTED", { canTriage: false });
    expect(state.waitForQlcl).toBe(true);
    expect(state.targetId).toBeNull();
  });

  it("skips investigation when triage says investigation is not required", () => {
    const state = getIncidentJourneyState("TRIAGED", { canTriage: true });
    expect(state.step).toBe(4);
    expect(state.skippedInvestigation).toBe(true);
    expect(state.targetId).toBe("incident-follow-up-transition");
  });

  it("keeps RCA incidents in the investigation step", () => {
    const state = getIncidentJourneyState("INVESTIGATING", {
      canInvestigate: true,
      rcaRequired: true,
    });
    expect(state.step).toBe(3);
    expect(state.targetId).toBe("incident-investigation");
    expect(state.title).toContain("RCA");
  });

  it("routes follow-up incidents to Action/CAPA", () => {
    const state = getIncidentJourneyState("ACTION_FOLLOW_UP");
    expect(state.step).toBe(4);
    expect(state.targetId).toBe("incident-actions");
  });

  it("routes a closable incident to the close gate", () => {
    const state = getIncidentJourneyState("AWAITING_CLOSURE", { canClose: true });
    expect(state.step).toBe(5);
    expect(state.targetId).toBe("incident-close");
  });

  it("routes closed incidents to lessons learned", () => {
    const state = getIncidentJourneyState("CLOSED");
    expect(state.step).toBe(6);
    expect(state.targetId).toBe("incident-lessons");
  });

  it("treats legacy CANCELLED incidents as terminal instead of an unknown workflow", () => {
    const state = getIncidentJourneyState("CANCELLED");
    expect(state.step).toBe(6);
    expect(state.targetId).toBeNull();
    expect(state.title).toContain("kết thúc");
  });

  it("maps every supported workflow status to a concrete user step", () => {
    const statuses = [
      "REPORTED",
      "RETURNED",
      "TRIAGED",
      "INVESTIGATION_REQUIRED",
      "INVESTIGATING",
      "ACTION_FOLLOW_UP",
      "AWAITING_CLOSURE",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ];
    for (const status of statuses) {
      const state = getIncidentJourneyState(status, {
        canTriage: true,
        canInvestigate: true,
        canClose: true,
        rcaRequired: status === "INVESTIGATING",
      });
      expect(state.step).toBeGreaterThanOrEqual(2);
      expect(state.title).not.toBe("Kiểm tra trạng thái hồ sơ");
    }
  });
});
