import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Follow-up to emr-api-caller-org-shared.test.ts: the same "look up the
// caller's organization_id via the admin client" duplication existed well
// beyond the EMR module — 10 more route files across plans export,
// admin settings/departments, global search, evidence delete and the
// recurring-work engine, each with its own copy-pasted variable name
// (caller/profile/p) and its own (sometimes missing) error handling.
// Consolidated onto the same shared src/lib/api-auth.ts helper, keeping
// each route's own existing status code/message for its "no organization"
// response (403 vs 400, "chưa gắn tổ chức" vs "chưa gắn bệnh viện" differ
// intentionally per route and were preserved, not homogenized).
describe("Non-EMR API routes — callerOrganizationId lookup shared, not copy-pasted per route", () => {
  const routePaths = [
    "src/app/api/plans/[id]/export/word/route.ts",
    "src/app/api/plans/[id]/export/excel/route.ts",
    "src/app/api/admin/settings/route.ts",
    "src/app/api/admin/work-calendar-holidays/route.ts",
    "src/app/api/admin/departments/route.ts",
    "src/app/api/admin/departments/[id]/roles/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/evidence/[id]/route.ts",
    "src/app/api/calendar/recurring/route.ts",
    "src/app/api/calendar/recurring/[id]/route.ts",
  ];
  const routes = routePaths.map((p) => readFileSync(p, "utf8"));

  it("none of these routes inline the profiles lookup or keep their own local org-lookup helper (e.g. orgFor) any more", () => {
    for (const route of routes) {
      expect(route).not.toContain('from("profiles").select("organization_id")');
      expect(route).not.toMatch(/async function (callerOrganizationId|orgFor)\(/);
    }
  });

  it("every route imports the shared helper and calls it with the authenticated user's id", () => {
    for (const route of routes) {
      expect(route).toMatch(/callerOrganizationId,\s*requireApiPermission|requireApiPermission,\s*callerOrganizationId|callerOrganizationId,\s*requireApiUser|requireApiUser,\s*callerOrganizationId/);
      expect(route).toMatch(/callerOrganizationId\(admin,\s*(auth|a)\.user\.id\)/);
    }
  });

  // Each route's own existing behavior for the "no organization" case is a
  // deliberate, route-specific response — this refactor must not quietly
  // change status codes or user-facing text while deduplicating the lookup.
  it("preserves each route's own distinct status code and message for a caller with no organization", () => {
    expect(readFileSync("src/app/api/plans/[id]/export/word/route.ts", "utf8")).toContain('return NextResponse.json({ error: "Tài khoản chưa gắn bệnh viện." }, { status: 403 });');
    expect(readFileSync("src/app/api/search/route.ts", "utf8")).toContain("if (!organizationId) return NextResponse.json({ ok: true, results: [] });");
    expect(readFileSync("src/app/api/evidence/[id]/route.ts", "utf8")).toContain('if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });');
  });
});
