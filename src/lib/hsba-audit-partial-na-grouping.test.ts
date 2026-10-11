import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(p, "utf8");

describe("HSBA four-state + structural grouping", () => {
  const client = read("src/components/hsba-audit-overview-client.tsx");
  const route = read("src/app/api/hsba-audit/audits/route.ts");
  it("shows PASS/PARTIAL/FAIL/NA for every audit type with final Vietnamese wording", () => {
    expect(client).not.toContain("supportsPartialAndNa");
    expect(client).toContain("Đạt một phần");
    expect(client).toContain("Không đạt");
    expect(client).toContain("Không áp dụng");
  });
  it("accepts four states for HSBA too and keeps overall FAIL > PARTIAL > PASS", () => {
    expect(route).toContain('const EXTRA_RESULTS = new Set(["PASS", "FAIL", "PARTIAL", "NA"])');
    expect(route).not.toContain('auditType === "HSBA" ? (r.result === "FAIL" ? "FAIL" : "PASS")');
    expect(route).toContain('normalizedResults.some((r) => r.result === "FAIL") ? "FAIL" : normalizedResults.some((r) => r.result === "PARTIAL") ? "PARTIAL" : "PASS"');
  });
  it("uses real group_id hierarchy instead of category", () => {
    expect(client).toContain("checklistGroups");
    expect(client).toContain("item.group_id");
    expect(client).toContain("Chưa phân nhóm");
  });
  it("only HSBA creates findings; PARTIAL escalates only by item flag", () => {
    expect(route).toContain("partialFindingById");
    expect(route).toContain("findingCandidates");
    expect(route).toContain('auditType === "HSBA" && findingCandidates.length');
  });
  it("has DRAFT-only group mutation and blocks deleting nonempty groups", () => {
    const groups = read("src/app/api/hsba-audit/checklist-groups/[id]/route.ts");
    expect(groups).toContain('group.status !== "DRAFT"');
    expect(groups).toContain('.eq("group_id", id)');
    expect(groups).toContain("Nhóm còn");
  });
});
