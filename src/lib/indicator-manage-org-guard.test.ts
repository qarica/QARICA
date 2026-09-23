import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Indicator management organization scope", () => {
  it("guards organizationId before querying indicator_definitions", () => {
    const source = readFileSync("src/app/(app)/indicators/manage/page.tsx", "utf8");
    const guard = source.indexOf('if (!user.organizationId) redirect("/dashboard?forbidden=1")');
    const query = source.indexOf('.from("indicator_definitions")');
    expect(guard).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(guard);
    expect(source).toContain('.eq("organization_id",user.organizationId)');
  });
});
