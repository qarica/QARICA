import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidOrganizationId } from "./org-guard";

describe("isValidOrganizationId", () => {
  it("accepts a real UUID", () => {
    expect(isValidOrganizationId("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(true);
    expect(isValidOrganizationId("3FA85F64-5717-4562-B3FC-2C963F66AFA6")).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isValidOrganizationId(null)).toBe(false);
    expect(isValidOrganizationId(undefined)).toBe(false);
  });

  it("rejects the stringified forms that would otherwise reach a uuid column filter", () => {
    expect(isValidOrganizationId("null")).toBe(false);
    expect(isValidOrganizationId("undefined")).toBe(false);
    expect(isValidOrganizationId("")).toBe(false);
  });

  it("rejects non-uuid-shaped strings", () => {
    expect(isValidOrganizationId("not-a-uuid")).toBe(false);
    expect(isValidOrganizationId("12345")).toBe(false);
    expect(isValidOrganizationId(123 as unknown)).toBe(false);
  });
});

describe("Admin settings page — UUID guard applied before any DB query (src/app/(app)/admin/settings/page.tsx)", () => {
  const source = readFileSync("src/app/(app)/admin/settings/page.tsx", "utf8");

  it("checks isValidOrganizationId before building the organizations/holidays query", () => {
    expect(source).toContain("isValidOrganizationId(orgId)");
    expect(source).toContain("if(hasOrg){");
  });

  it("never runs the uuid-filtered query when there is no valid organization id", () => {
    // the query construction must be inside the hasOrg-guarded block, not unconditional
    const guardIndex = source.indexOf("if(hasOrg){");
    const queryIndex = source.indexOf('.eq("id",orgId)');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(queryIndex).toBeGreaterThan(guardIndex);
  });

  it("distinguishes no-org, query-failure and org-not-found states instead of collapsing them", () => {
    expect(source).toContain("queryFailed");
    expect(source).toContain("orgMissing");
    expect(source).toContain("!hasOrg?");
  });

  it("never renders the raw Postgres/Supabase error message to the user", () => {
    expect(source).not.toContain("orgRes.error)?.message");
    expect(source).not.toContain("{(orgRes.error");
  });
});
