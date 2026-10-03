import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "Rà soát toàn bộ phần mềm xem có tinh gọn code" follow-up: the same
// "look up the caller's organization_id via the admin client" query was
// copy-pasted (sometimes as a named `callerOrganizationId` function,
// sometimes inlined under a `profile`/`caller`/`p` variable) into every
// single EMR API route — several silently dropping the query's own `error`
// instead of surfacing it (options/route.ts didn't check it at all).
// Consolidated into one shared helper in src/lib/api-auth.ts, imported
// everywhere instead.
describe("EMR API routes — callerOrganizationId lookup shared, not copy-pasted per route", () => {
  const apiAuth = readFileSync("src/lib/api-auth.ts", "utf8");
  const routePaths = [
    "src/app/api/emr/binding-groups/route.ts",
    "src/app/api/emr/binding-groups/[id]/route.ts",
    "src/app/api/emr/items/route.ts",
    "src/app/api/emr/items/[id]/route.ts",
    "src/app/api/emr/items/[id]/file/route.ts",
    "src/app/api/emr/items/export/route.ts",
    "src/app/api/emr/dashboard/route.ts",
    "src/app/api/emr/options/route.ts",
    "src/app/api/emr/timeline-milestones/route.ts",
    "src/app/api/emr/timeline-milestones/[id]/route.ts",
  ];
  const routes = routePaths.map((p) => readFileSync(p, "utf8"));

  it("defines exactly one shared implementation that surfaces the query's own error", () => {
    expect(apiAuth).toContain("export async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {");
    expect(apiAuth).toContain("return { organizationId: data?.organization_id ?? null, error };");
  });

  it("no EMR route file redeclares its own copy of the function, or inlines the same profiles lookup itself", () => {
    for (const route of routes) {
      expect(route).not.toMatch(/async function callerOrganizationId/);
      expect(route).not.toContain('from("profiles").select("organization_id")');
    }
  });

  it("every route imports the shared helper from @/lib/api-auth and checks its error before the missing-organization check", () => {
    for (const route of routes) {
      expect(route).toMatch(/import \{ callerOrganizationId, requireApiPermission \} from "@\/lib\/api-auth";/);
      expect(route).toMatch(/callerOrganizationId\(admin,\s*auth\.user\.id\)/);
    }
  });
});
