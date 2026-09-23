import { describe, expect, it } from "vitest";
import { hcmMonthNumber, incidentAttentionRank, incidentDomainDistribution } from "./incident-dashboard";

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
  it("counts shared quality domains only for visible Incident records without hard-coded labels", () => {
    const result = incidentDomainDistribution(
      ["i1", "i2", "i3"],
      [
        { record_id: "i1", domain_id: "d1" },
        { record_id: "i1", domain_id: "d2" },
        { record_id: "i2", domain_id: "d1" },
        { record_id: "hidden", domain_id: "d1" },
      ],
      [
        { id: "d1", name: "Lĩnh vực A", sort_order: 20 },
        { id: "d2", name: "Lĩnh vực B", sort_order: 10 },
      ],
    );
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["Lĩnh vực A", 2],
      ["Lĩnh vực B", 1],
    ]);
    expect(result.linkedRecordCount).toBe(2);
    expect(result.unclassifiedCount).toBe(1);
  });
});
