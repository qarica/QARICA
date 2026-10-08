import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an explicit request: "Anh nói là tạo một menu quản lý nhóm
// gáy bao gồm thêm mới, cập nhật hoặc xóa, ngừng sử dụng. Nhưng em chưa
// tạo, mình đâu mà đâu thể sửa hoặc lưu cái tên gáy ngay trực tiếp trong
// cái cây master được em. Cái cây đó chỉ dành di chuyển lên xuống các biểu
// mẫu thôi." — a dedicated "Quản lý nhóm gáy" screen, separate from the
// master tree page (which only assigns a form to a group and moves it
// up/down within that group — see emr-bieu-mau-tree-move-order.test.ts and
// emr-bieu-mau-binding-order.test.ts for what it no longer does).
describe("EMR Biểu mẫu — Quản lý nhóm gáy (dedicated add/update/delete/deactivate screen)", () => {
  const page = readFileSync("src/app/(app)/emr/bieu-mau/nhom-gay/page.tsx", "utf8");
  const client = readFileSync("src/components/emr-bieu-mau-groups-client.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/20261010_emr_binding_groups_is_active_v1.sql", "utf8");
  const groupsRoute = readFileSync("src/app/api/emr/binding-groups/route.ts", "utf8");
  const groupItemRoute = readFileSync("src/app/api/emr/binding-groups/[id]/route.ts", "utf8");

  it("the page enforces emr.view like every other EMR page and shares the EMR workspace nav", () => {
    expect(page).toContain('requirePermission(user, "emr.view");');
    expect(page).toContain("<EmrWorkspaceNav");
  });

  it("the tree page links to the groups screen, and the groups screen links back", () => {
    const treePage = readFileSync("src/app/(app)/emr/bieu-mau/tree/page.tsx", "utf8");
    expect(treePage).toContain('<Link className="button secondary" href="/emr/bieu-mau/nhom-gay">Quản lý nhóm gáy</Link>');
    expect(page).toContain('href="/emr/bieu-mau/tree"');
  });

  it("thêm mới: declares a new group through the existing catalog POST route", () => {
    expect(client).toContain('fetch("/api/emr/binding-groups", { method: "POST"');
    expect(client).toContain("async function declareGroup(e: React.FormEvent)");
  });

  it("cập nhật: renames a group through a dedicated edit flow (button + Lưu/Huỷ), not a bare input that saves on change", () => {
    expect(client).toContain("function startRename(group: Group)");
    expect(client).toContain("async function saveRename(group: Group)");
  });

  it("cập nhật: reorders a group's STT on blur, only when the value actually changed", () => {
    expect(client).toContain("onBlur={(e) => {");
    expect(client).toContain("if (Number.isFinite(next) && next !== group.sort_order) patchGroup(group, { sort_order: next });");
  });

  it("ngừng sử dụng: adds a soft is_active flag instead of deleting data, and the PATCH route can toggle it", () => {
    expect(migration).toContain("alter table public.emr_binding_groups add column if not exists is_active boolean not null default true;");
    expect(groupItemRoute).toContain("if (body.is_active !== undefined) update.is_active = !!body.is_active;");
    expect(client).toContain("async function toggleActive(group: Group)");
  });

  it("xoá: a real DELETE route exists, requires emr.manage, and refuses to delete a group that still has forms assigned to it", () => {
    expect(groupItemRoute).toContain("export async function DELETE(request: Request");
    expect(groupItemRoute).toContain('requireApiPermission("emr.manage")');
    expect(groupItemRoute).toContain("if (count) return NextResponse.json({ error: ");
  });

  it("the client blocks the delete call client-side too when the group still has forms, instead of relying only on the server error", () => {
    expect(client).toContain("async function deleteGroup(group: Group, itemCount: number)");
    expect(client).toContain("if (itemCount > 0) {");
  });

  it("GET returns is_active so the screen can show Đang dùng / Ngừng sử dụng per group", () => {
    expect(groupsRoute).toContain('select("id,name,code,sort_order,is_active")');
  });

  it("every write action is gated behind canManage (emr.manage), not shown to a plain viewer", () => {
    expect(client).toContain("{canManage ? (");
    expect(client).toContain('{canManage ? <th style={{ width: 220 }}>Thao tác</th> : null}');
  });
});
