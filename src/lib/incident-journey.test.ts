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
});
