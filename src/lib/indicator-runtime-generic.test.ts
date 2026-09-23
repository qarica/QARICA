import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("indicator runtime generic architecture", () => {
  it("does not import or reconcile a hard-coded annual indicator blueprint", () => {
    const overview = readFileSync("src/components/indicator-quality-overview.tsx", "utf8");
    const registry = readFileSync("src/components/registry-module-page.tsx", "utf8");
    expect(overview).not.toContain("INDICATOR_2026_BLUEPRINT");
    expect(overview).not.toContain("blueprintResolution");
    expect(overview).not.toContain("IndicatorSourceReconciliationClient");
    expect(registry).not.toContain("canManage={user.permissions.includes(\"indicators.manage\")}");
  });
});
