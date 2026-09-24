import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES=[
  "src/app/api/monitoring/rounds/[id]/5s-results/route.ts",
  "src/app/api/record-lifecycle/route.ts",
  "src/app/api/domain-records/route.ts",
  "src/app/api/records/[id]/actions/route.ts",
  "src/app/api/plans/[id]/actions/route.ts",
];

describe("generic tenant-scope wording", () => {
  it("does not describe organization scope as a specific hospital tenant", () => {
    for (const path of FILES) {
      const source=readFileSync(path,"utf8");
      expect(source).not.toContain("phạm vi bệnh viện");
      expect(source).not.toContain("chưa gắn bệnh viện");
      expect(source).not.toContain("thuộc bệnh viện hiện tại");
    }
  });
});
