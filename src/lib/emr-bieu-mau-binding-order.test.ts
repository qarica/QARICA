import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit complaint: "Khai báo nhóm gáy thiếu số thứ tự
// các nhóm gáy và trình tự thứ tự biểu mẫu sắp trong gáy" — confirmed against
// a real hospital reference doc (PL02.V2_KHTH.QT.05, sheet "GÁY" gives each
// gáy its own STT; sheet "BIỂU MẪU" numbers every form continuously within
// its gáy). Added as emr_binding_groups.sort_order (group order) and
// details.binding_group_order (form order within its gáy) — both plain
// numbers a manager edits inline from the master tree page, not hard-coded.
describe("EMR Biểu mẫu — Nhóm gáy order + in-gáy form order", () => {
  const groupsMigration = readFileSync("supabase/migrations/20261008_emr_binding_groups_sort_order_v1.sql", "utf8");
  const groupsRoute = readFileSync("src/app/api/emr/binding-groups/route.ts", "utf8");
  const groupItemRoute = readFileSync("src/app/api/emr/binding-groups/[id]/route.ts", "utf8");
  const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

  it("adds sort_order to the declared Nhóm gáy catalog", () => {
    expect(groupsMigration).toContain("alter table public.emr_binding_groups add column if not exists sort_order integer not null default 0;");
  });

  it("GET orders groups by sort_order, and a newly declared group appends at the end (count-based), not at position 0", () => {
    expect(groupsRoute).toContain('.order("sort_order")');
    expect(groupsRoute).toContain("sort_order: count ?? 0");
  });

  it("the [id] route lets a manager change a group's sort_order and/or its name", () => {
    expect(groupItemRoute).toContain('requireApiPermission("emr.manage")');
    expect(groupItemRoute).toContain("update.sort_order = sortOrder;");
    expect(groupItemRoute).toContain("update.name = newName;");
  });

  it("renaming a group rejects a conflicting existing name, and otherwise cascades the new name to every BIEU_MAU item still storing the OLD name — never leaves forms pointing at a name that no longer exists in the catalog", () => {
    expect(groupItemRoute).toContain("Đã có nhóm gáy khác dùng tên này.");
    expect(groupItemRoute).toContain('.filter("details->>binding_group", "eq", current.name);');
    expect(groupItemRoute).toContain("binding_group: newName");
  });

  it("the tree page lets a manager rename a declared group inline (Sửa tên), not only reorder it", () => {
    expect(client).toContain("function startRename(group: Group)");
    expect(client).toContain("async function saveRename(group: Group)");
    expect(client).toContain(">Sửa tên<");
  });

  it("binding_group_order is a plain number field, hidden from the main grid (managed only via the tree page) just like binding_group itself", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "binding_group_order");
    expect(field?.type).toBe("number");
    expect(field?.hideFromGrid).toBe(true);
  });

  it("declared groups render in sort_order, not alphabetically; undeclared free-text names come after them, 'Chưa phân nhóm' always last", () => {
    expect(client).toContain("if (ga && gb) return ga.sort_order - gb.sort_order;");
  });

  it("forms within a gáy sort by their own binding_group_order (numeric), unordered ones pushed to the end instead of floating at the top", () => {
    expect(client).toContain("const va = Number.isFinite(oa) ? oa : Infinity, vb = Number.isFinite(ob) ? ob : Infinity;");
  });

  it("both the group order and the in-gáy form order are plain editable number inputs for a manager, not up/down-swap buttons", () => {
    expect(client).toContain('aria-label="Số thứ tự nhóm gáy"');
    expect(client).toContain('aria-label="Số thứ tự biểu mẫu trong gáy"');
  });
});
