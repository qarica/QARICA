import { describe, expect, it } from "vitest";
import {
  CRITERION_2026_PRIORITY,
  CRITERION_2026_SOURCE_GROUPS,
  responsibilityDepartmentCandidates,
  sourceLeadForCode,
  sourceNeedsManualConfirmation,
} from "./criteria-2026-source";

describe("2026 criteria responsibility source", () => {
  it("covers all 83 criteria exactly once", () => {
    const codes = CRITERION_2026_SOURCE_GROUPS.flatMap((group) => group.codes);
    expect(codes).toHaveLength(83);
    expect(new Set(codes).size).toBe(83);
    expect(sourceLeadForCode("D3.1")).toBe("Tổ QLCL");
    expect(sourceLeadForCode("E2.1")).toBe("Khoa Nhi");
  });

  it("contains exactly the 13 priority criteria", () => {
    expect(CRITERION_2026_PRIORITY).toHaveLength(13);
    expect(new Set(CRITERION_2026_PRIORITY.map((item) => item.code)).size).toBe(13);
  });

  it("suggests one clear current department when the source name is unambiguous", () => {
    const matches = responsibilityDepartmentCandidates("Khoa Dược", [
      { id: "d", name: "Khoa Dược" },
      { id: "n", name: "Khoa Nhi" },
    ]);
    expect(matches.map((item) => item.id)).toEqual(["d"]);
  });

  it("keeps QLCL ambiguous when two current departments can plausibly match the historical source label", () => {
    const matches = responsibilityDepartmentCandidates("Tổ QLCL", [
      { id: "q", name: "Phòng Quản lý chất lượng" },
      { id: "k", name: "Phòng Kế hoạch tổng hợp" },
    ]);
    expect(new Set(matches.map((item) => item.id))).toEqual(new Set(["q", "k"]));
  });
  it("never auto-confirms a multi-owner source label from a partial department match", () => {
    expect(sourceNeedsManualConfirmation("Ban Giám đốc, Phòng Nhân sự")).toBe(true);
  });

});
