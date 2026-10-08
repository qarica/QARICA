import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện Trung bình: trang "Hồ sơ đã hủy" chỉ tra cứu — hủy nhầm thì không
// có cách khôi phục, phải tạo lại từ đầu (mất mã hồ sơ gốc). Thêm action
// RESTORE vào đúng RPC vòng đời chung (qlcl_change_record_lifecycle_v1) dùng
// chung cho mọi loại hồ sơ, thay vì route/RPC riêng cho từng module.
describe("Hồ sơ đã hủy có thể khôi phục (RESTORE) qua đúng RPC vòng đời chung", () => {
  it("migration mới thêm RESTORE vào danh sách action hợp lệ, chỉ cho phép khi đang CANCELLED, xoá closed_at", () => {
    const migration = read("supabase/migrations/20261028_record_lifecycle_restore_v1.sql");
    expect(migration).toContain("if v_action not in ('CANCEL','ARCHIVE','RESTORE') then");
    expect(migration).toContain("if v_record.lifecycle_status <> 'CANCELLED' then");
    expect(migration).toContain("when v_action='RESTORE' then null");
    expect(migration).toContain("v_target:='ACTIVE';");
  });

  it("route /api/record-lifecycle chấp nhận action RESTORE, chặn khi hồ sơ không phải CANCELLED", () => {
    const route = read("src/app/api/record-lifecycle/route.ts");
    expect(route).toContain('["CANCEL", "ARCHIVE", "RESTORE"]');
    expect(route).toContain('if (action === "RESTORE" && record.lifecycle_status !== "CANCELLED")');
  });

  it("component dùng chung cho mọi loại hồ sơ hiện nút Khôi phục khi hồ sơ đã hủy, thay vì ẩn hẳn như trước", () => {
    const client = read("src/components/global-record-lifecycle-actions.tsx");
    expect(client).toContain('const canRestore=!!info.canManage&&record.lifecycle_status==="CANCELLED";');
    expect(client).toContain("Khôi phục hồ sơ");
    expect(client).toContain('if(!canCancel&&!canRestore)return null;');
  });

  it("khôi phục vẫn yêu cầu nhập lý do (cùng rule với hủy/lưu trữ)", () => {
    const client = read("src/components/global-record-lifecycle-actions.tsx");
    expect(client).toContain("Lý do khôi phục");
    expect(client).toContain("disabled={busy||reason.trim().length<3}");
  });
});
