import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a real request: EMR rollout items previously supported
// exactly one department (department_id uuid, NULL meaning "toàn viện") —
// there was no way to scope an item to several specific departments without
// scoping it to every department. department_ids (uuid[]) replaces it as
// the one source of truth; empty array keeps "toàn viện".
describe("EMR rollout items — department_ids (multi-department) replaces department_id", () => {
  it("has a migration that adds department_ids and drops the old single-value column", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const migration = files.find((f) => {
      const sql = readFileSync(`${dir}/${f}`, "utf8");
      return sql.includes("add column if not exists department_ids uuid[]");
    });
    expect(migration, "expected a migration adding emr_rollout_items.department_ids").toBeTruthy();
    const sql = readFileSync(`${dir}/${migration}`, "utf8");
    expect(sql).toContain("drop column if exists department_id");
    // existing single-department data must be preserved, not silently dropped
    expect(sql).toContain("department_ids = array[department_id]");
  });

  it("the dashboard aggregation route reads department_ids and fans an item out to every department it's scoped to", () => {
    const route = readFileSync("src/app/api/emr/dashboard/route.ts", "utf8");
    expect(route).toContain("department_ids");
    expect(route).not.toMatch(/[^_]department_id[^s]/);
    expect(route).toContain("x.department_ids?.includes(d.id)");
  });

  it("items POST/PATCH validate every id in department_ids belongs to an active department in the caller's organization", () => {
    const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
    const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain("function sanitizeDepartmentIds(");
      expect(route).toContain('.eq("is_active", true).in("id", ids)');
      expect(route).not.toMatch(/[^_]department_id[^s]/);
    }
  });

  it("the create/edit form renders a multi-select checkbox group (not a single <select>) for department scope", () => {
    const client = readFileSync("src/components/emr-category-client.tsx", "utf8");
    expect(client).toContain("department_ids:string[]");
    expect(client).toContain('className="department-checks"');
    expect(client).toContain("form.department_ids.includes(d.id)");
    expect(client).toContain("toggleId(form.department_ids, d.id)");
    expect(client).not.toMatch(/[^_]department_id[^s]/);
  });

  it("the post-deploy verification script checks for department_ids, not the dropped department_id column", () => {
    const verification = readFileSync("supabase/verification/EMR_COMMAND_CENTER_POSTCHECK_V1.sql", "utf8");
    expect(verification).toContain("department_ids");
    expect(verification).not.toMatch(/[^_]department_id[^s]/);
  });
});
