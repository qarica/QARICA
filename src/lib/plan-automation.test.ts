import { describe, expect, it } from "vitest";
import {
  automationKindLabel,
  suggestPlanAutomationKind,
  suggestPlanAutomationResource,
} from "./plan-automation";

describe("plan automation assistant", () => {
  it("suggests an indicator from Vietnamese task text", () => {
    expect(suggestPlanAutomationKind({ title: "Theo dõi tỷ lệ té ngã hàng quý" })).toBe("INDICATOR");
  });

  it("suggests monitoring from compliance-monitoring task text", () => {
    expect(suggestPlanAutomationKind({ title: "Giám sát tuân thủ vệ sinh tay" })).toBe("MONITORING");
  });

  it("keeps ordinary work as Action", () => {
    expect(suggestPlanAutomationKind({ title: "Soạn quy trình tiếp nhận người bệnh" })).toBe("ACTION");
  });

  it("returns one strong matching existing resource for one-click confirmation", () => {
    const match = suggestPlanAutomationResource("Giám sát vệ sinh tay", [
      { id: "a", label: "Bảng kiểm vệ sinh tay v3" },
      { id: "b", label: "Bảng kiểm an toàn phẫu thuật v2" },
    ]);
    expect(match?.id).toBe("a");
  });

  it("does not guess when resource matches are ambiguous", () => {
    const match = suggestPlanAutomationResource("Theo dõi tỷ lệ", [
      { id: "a", label: "Tỷ lệ té ngã" },
      { id: "b", label: "Tỷ lệ loét tỳ đè" },
    ]);
    expect(match).toBeNull();
  });

  it("has readable automation labels", () => {
    expect(automationKindLabel("INDICATOR")).toContain("Chỉ số");
  });
});
