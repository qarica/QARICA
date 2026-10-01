import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit user decision: "Người phụ trách" (a single
// named person, owner_user_id) is replaced by "Đơn vị phụ trách"
// (owner_department_id, a single responsible department) — a department
// already has people in it, so accountability should sit at the department
// level, the same way every other EMR scoping concept already does. This is
// DISTINCT from department_ids (the item's scope of application, which can
// be several departments or empty = toàn viện) — owner_department_id is the
// ONE department accountable for the item.
describe("EMR — Đơn vị phụ trách (owner_department_id) replaces Người phụ trách", () => {
  const migration = readFileSync("supabase/migrations/20261005_emr_rollout_items_owner_department_v1.sql", "utf8");
  const client = readFileSync("src/components/emr-category-client.tsx", "utf8");
  const postRoute = readFileSync("src/app/api/emr/items/route.ts", "utf8");
  const patchRoute = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
  const exportRoute = readFileSync("src/app/api/emr/items/export/route.ts", "utf8");
  const dashboardRoute = readFileSync("src/app/api/emr/dashboard/route.ts", "utf8");
  const syncRoute = readFileSync("src/app/api/notifications/sync-emr-reminders/route.ts", "utf8");
  const optionsRoute = readFileSync("src/app/api/emr/options/route.ts", "utf8");

  it("adds owner_department_id (fk to departments) and drops owner_user_id, with a best-effort backfill from the old owner's own primary department", () => {
    expect(migration).toContain("alter table public.emr_rollout_items add column if not exists owner_department_id uuid references public.departments(id);");
    expect(migration).toContain("alter table public.emr_rollout_items drop column if exists owner_user_id;");
    expect(migration).toContain("set owner_department_id = p.primary_department_id");
  });

  it("the modal shows a single-select department picker labeled 'Đơn vị phụ trách', not a per-person dropdown", () => {
    expect(client).toContain('<label>Đơn vị phụ trách<select value={form.owner_department_id}');
    expect(client).toContain("{departments.map(d=><option key={d.id} value={d.id}>{d.short_name||d.name}</option>)}");
    expect(client).not.toContain("Người phụ trách<select");
  });

  it("the now-unused per-user options fetch (users list) was removed, not left as dead state", () => {
    expect(client).not.toContain("setUsers");
    expect(optionsRoute).not.toContain("users:");
  });

  it("POST/PATCH validate owner_department_id against the caller's own active departments, mirroring department_ids validation — not against profiles", () => {
    expect(postRoute).toContain('const ownerDepartmentId = body.owner_department_id ? String(body.owner_department_id) : null;');
    expect(postRoute).toContain('.from("departments").select("id").eq("id", ownerDepartmentId)');
    expect(patchRoute).toContain('body.owner_department_id');
    expect(patchRoute).toContain('.from("departments").select("id").eq("id",v)');
  });

  it("the Excel export shows the responsible department's name (not a person's), relabeled to Đơn vị phụ trách", () => {
    expect(exportRoute).toContain("<th>Đơn vị phụ trách</th>");
    expect(exportRoute).toContain("deptName.get(it.owner_department_id)");
  });

  it("the dashboard's owner-coverage and NO_OWNER escalation reasoning follow the same renamed field", () => {
    expect(dashboardRoute).toContain("owner_department_id");
    expect(dashboardRoute).not.toContain("owner_user_id");
  });

  it("the EMR reminder sync route notifies the department's HEAD/QUALITY_NETWORK_MEMBER instead of a single named owner, since there is no longer one person to notify directly", () => {
    expect(syncRoute).toContain('.eq("owner_department_id", primaryDepartmentId)');
    expect(syncRoute).not.toContain("owner_user_id");
  });
});
