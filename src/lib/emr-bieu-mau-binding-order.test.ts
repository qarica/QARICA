import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORY_FIELDS } from "./emr-categories";

// Regression for an explicit complaint: "Khai báo nhóm gáy thiếu số thứ tự
// các nhóm gáy và trình tự thứ tự biểu mẫu sắp trong gáy" — confirmed against
// a real hospital reference doc (PL02.V2_KHTH.QT.05, sheet "GÁY" gives each
// gáy its own STT; sheet "BIỂU MẪU" numbers every form continuously within
// its gáy). Added as emr_binding_groups.sort_order (group order, declared
// and reordered on the "Quản lý nhóm gáy" screen — see
// emr-bieu-mau-groups-client.test.ts) and details.binding_group_order (form
// order within its gáy, managed on the master tree page via move up/down
// buttons — see emr-bieu-mau-tree-move-order.test.ts).
describe("EMR Biểu mẫu — Nhóm gáy order + in-gáy form order", () => {
  const groupsMigration = readFileSync("supabase/migrations/20261008_emr_binding_groups_sort_order_v1.sql", "utf8");
  const groupsRoute = readFileSync("src/app/api/emr/binding-groups/route.ts", "utf8");
  const groupItemRoute = readFileSync("src/app/api/emr/binding-groups/[id]/route.ts", "utf8");
  const treeClient = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");

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

  it("binding_group_order is a plain number field, hidden from the main grid (managed only via the tree page) just like binding_group itself", () => {
    const field = EMR_CATEGORY_FIELDS.BIEU_MAU.find((f) => f.key === "binding_group_order");
    expect(field?.type).toBe("number");
    expect(field?.hideFromGrid).toBe(true);
  });

  it("the master tree page renders declared groups in sort_order (read-only there — reordering groups happens on the groups screen), not alphabetically; undeclared free-text names come after them, 'Chưa phân nhóm' always last", () => {
    expect(treeClient).toContain("if (ga && gb) return ga.sort_order - gb.sort_order;");
  });

  it("forms within a gáy sort by their own binding_group_order (numeric), unordered ones pushed to the end instead of floating at the top", () => {
    expect(treeClient).toContain("const va = Number.isFinite(oa) ? oa : Infinity, vb = Number.isFinite(ob) ? ob : Infinity;");
  });

  // Follow-up, explicit request: "mình đâu mà đâu thể sửa hoặc lưu cái tên
  // gáy ngay trực tiếp trong cái cây master được em, cái cây đó chỉ dành di
  // chuyển lên xuống các biểu mẫu thôi" — group rename and the group's own
  // STT input were pulled out of the master tree page entirely (onto the
  // groups screen); the tree now only assigns a form to a group and moves
  // it up/down within that group.
  it("the master tree page no longer renames groups or edits a group's own STT — only the groups screen does", () => {
    expect(treeClient).not.toContain("function startRename");
    expect(treeClient).not.toContain("async function saveRename");
    expect(treeClient).not.toContain(">Sửa tên<");
    expect(treeClient).not.toContain('aria-label="Số thứ tự nhóm gáy"');
  });

  // Follow-up, explicit request: "bỏ mũi tên" — the up/down buttons didn't
  // work well on the phones anh/chị test with, replaced by touch-friendly
  // drag-and-drop (see emr-bieu-mau-tree-move-order.test.ts).
  it("the in-gáy form order is drag-and-drop, not a typed number or up/down buttons", () => {
    expect(treeClient).not.toContain('aria-label="Số thứ tự biểu mẫu trong gáy"');
    expect(treeClient).not.toContain('aria-label="Di chuyển lên"');
    expect(treeClient).not.toContain('aria-label="Di chuyển xuống"');
    expect(treeClient).toContain('aria-label="Kéo để đổi thứ tự"');
  });
});
