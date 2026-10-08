import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu: "Cấu trúc gáy HSBA" đẹp như tham khảo cần Mã nhóm gáy (vd số La
// Mã "V") tách riêng khỏi tên đầy đủ của nhóm ("V. Giấy, phiếu đánh giá...").
// emr_binding_groups.name hiện tại là text tự do (per-org master data) —
// thêm cột `code` (migration 20261029) để tách mã ngắn khỏi tên đầy đủ, mã
// cũng tự do theo từng viện, không hard-code 1 bộ số La Mã cố định.
//
// MIGRATION-GATED: các route/UI dưới đây SELECT trực tiếp cột `code` — chỉ
// commit sau khi 20261029_emr_binding_group_code_v1.sql đã chạy thành công,
// nếu không GET /api/emr/binding-groups sẽ lỗi "column does not exist" và
// làm sập cả trang Cây biểu mẫu lẫn Quản lý nhóm gáy.
describe("EMR Biểu mẫu — Mã nhóm gáy (La Mã) tách khỏi tên đầy đủ", () => {
  const migration = read("supabase/migrations/20261029_emr_binding_group_code_v1.sql");
  const groupsRoute = read("src/app/api/emr/binding-groups/route.ts");
  const groupRoute = read("src/app/api/emr/binding-groups/[id]/route.ts");
  const groupsClient = read("src/components/emr-bieu-mau-groups-client.tsx");
  const treeClient = read("src/components/emr-bieu-mau-tree-client.tsx");

  it("migration thêm cột code tùy chọn vào emr_binding_groups, không đổi cách lưu name", () => {
    expect(migration).toContain("alter table public.emr_binding_groups add column if not exists code text");
  });

  it("GET/POST/PATCH nhóm gáy đều đọc/ghi được code", () => {
    expect(groupsRoute).toContain('select("id,name,code,sort_order,is_active")');
    expect(groupsRoute).toContain("const code = body.code !== undefined");
    expect(groupRoute).toContain('if (body.code !== undefined) update.code = String(body.code || "").trim() || null;');
  });

  it("màn hình Quản lý nhóm gáy có ô nhập Mã nhóm khi khai báo mới và khi sửa từng dòng", () => {
    expect(groupsClient).toContain('placeholder="Mã (vd: V)"');
    expect(groupsClient).toContain("code: newGroupCode.trim() || null");
    expect(groupsClient).toContain('aria-label="Mã nhóm gáy"');
  });

  it("cây biểu mẫu hiện badge mã nhóm bên cạnh tên nhóm nếu nhóm có khai báo mã", () => {
    expect(treeClient).toContain("bieu-mau-tree-group-code");
    expect(treeClient).toContain("groupByName.get(groupName)?.code");
  });
});
