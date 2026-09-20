import { describe, expect, it } from "vitest";
import { hcmMonthNumber, incidentAttentionRank } from "./incident-dashboard";

describe("incident dashboard helpers", () => {
  it("prioritizes open serious and investigation cases above closed cases", () => {
    expect(incidentAttentionRank({ workflow_status: "INVESTIGATING", serious_event_flag: true })).toBe(50);
    expect(incidentAttentionRank({ workflow_status: "REPORTED", serious_event_flag: true })).toBe(40);
    expect(incidentAttentionRank({ workflow_status: "INVESTIGATING", serious_event_flag: false })).toBe(30);
    expect(incidentAttentionRank({ workflow_status: "REPORTED", serious_event_flag: false })).toBe(20);
    expect(incidentAttentionRank({ workflow_status: "CLOSED", serious_event_flag: true })).toBe(10);
    expect(incidentAttentionRank({ workflow_status: "REJECTED", serious_event_flag: true })).toBe(10);
  });

  it("buckets incident timestamps by Ho Chi Minh City month", () => {
    expect(hcmMonthNumber("2026-09-30T17:30:00Z")).toBe(10);
    expect(hcmMonthNumber("2026-09-30T16:30:00Z")).toBe(9);
    expect(hcmMonthNumber(null)).toBeNull();
  });
});
