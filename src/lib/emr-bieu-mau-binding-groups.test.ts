import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: "Nhóm gáy" (binding_group) was free
// text, so every form re-typed its own spelling of the same group name with
// no guarantee of consistency. The user asked for a declared catalog (one
// place to name a group once) and a select-from-list when assigning it to a
// form. Per CLAUDE.md principle 1, group names are per-hospital master
// data, not a fixed business taxonomy — hence a real small catalog table,
// not a hard-coded option list.
//
// Follow-up, explicit request: declaring/renaming/reordering/deactivating/
// deleting the catalog itself moved to a dedicated "Quản lý nhóm gáy"
// screen (emr-bieu-mau-groups-client.test.ts) — this tree page only
// assigns which already-declared gáy a form belongs to.
describe("EMR Biểu mẫu — Nhóm gáy declared catalog, assigned from the master tree page", () => {
  const migration = readFileSync("supabase/migrations/20261004_emr_binding_groups_v1.sql", "utf8");
  const route = readFileSync("src/app/api/emr/binding-groups/route.ts", "utf8");
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("declares a real, org-scoped catalog table — not a hard-coded list of group names", () => {
    expect(migration).toContain("create table if not exists public.emr_binding_groups");
    expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
    expect(migration).toContain("unique (organization_id, name)");
  });

  it("RLS follows the same org-scoped read pattern as emr_rollout_items; writes go through the service-role API route, not RLS write policies", () => {
    expect(migration).toContain("alter table public.emr_binding_groups enable row level security");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
  });

  it("GET requires emr.view, POST (declaring a new group) requires emr.manage", () => {
    expect(route).toContain('requireApiPermission("emr.view")');
    expect(route).toContain('requireApiPermission("emr.manage")');
  });

  it("declaring an already-declared name is a no-op, not a duplicate-key error", () => {
    expect(route).toContain('ignoreDuplicates: true');
  });

  it("the tree page reads the declared catalog to assign/sort by it, but does not declare new groups itself", () => {
    expect(client).toContain('fetch("/api/emr/binding-groups")');
    expect(client).not.toContain("function declareGroup");
  });

  it("reassigning a form's group requires a dedicated 'Đổi nhóm' button, not a bare select that saves on change", () => {
    expect(client).toContain("function startChangeGroup(item: TreeItem, currentGroupName: string)");
    expect(client).toContain("async function saveChangeGroup(item: TreeItem)");
    expect(client).toContain('onChange={(e) => setPendingGroupValue(e.target.value)}');
    expect(client).not.toMatch(/onChange=\{\(e\) => updateItemDetails\(item, \{ binding_group: e\.target\.value \}\)\}/);
  });

  it("reassigning a form's group sends its FULL existing details, not just the one changed key — the generic PATCH route replaces the whole details object", () => {
    expect(client).toContain("async function updateItemDetails(item: TreeItem, patch: Record<string, unknown>, onSuccess?: () => void)");
    expect(client).toContain("body: JSON.stringify({ details: { ...item.details, ...patch } }),");
  });

  it("the group-assign control is only rendered for managers (emr.manage), not every viewer", () => {
    expect(client).toMatch(/canManage \? \(\s*<td>\s*\{changingGroupItemId/);
  });

  it("only offers active declared groups as new-assignment options, plus the item's current group so switching away from it is never blocked", () => {
    expect(client).toContain("function groupOptions(currentGroupName: string) {");
    expect(client).toContain("const names = groups.filter((g) => g.is_active).map((g) => g.name);");
  });
});
