import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sidebar attention projection excludes cancelled/hidden records", () => {
  const projection = readFileSync("src/lib/attention-projection.ts", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("filters operationally hidden lifecycle statuses before creating badges", () => {
    expect(projection).toContain("isOperationallyHiddenStatus");
    expect(projection).toContain("visibleRecordIds");
    expect(projection).toContain("continue;");
  });

  it("AppShell reads the projection endpoint instead of rescanning Action/domain tables", () => {
    expect(shell).toContain("/api/notifications/attention");
    expect(shell).not.toContain('supabase.from("vw_actions_dashboard")');
  });
});
