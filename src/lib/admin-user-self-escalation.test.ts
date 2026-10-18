import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ rà soát bảo mật: PATCH /api/admin/users/[id] chỉ chặn tự
// NGƯNG HOẠT ĐỘNG tài khoản của chính mình (is_active), nhưng không có bất
// kỳ chặn nào với role_ids/effective_permission_ids — người dùng có cả
// permissions.manage và users.manage (vd admin, qlcl01) có thể tự PATCH
// chính mình để thêm vai trò/quyền (kể cả SYSTEM_ADMIN) mà không cần người
// thứ 2 phê duyệt. Cùng nguyên tắc 4-mắt đã áp dụng cho EMR go-live
// (chặn tự xác minh) và CAPA (chặn tự phê duyệt). Fix: so vai trò/quyền gửi
// lên với vai trò/quyền ĐANG CÓ khi id trùng với người gọi — khác thì chặn;
// các field khác (tên, SĐT, khoa/phòng...) vẫn được tự sửa bình thường.
describe("PATCH /api/admin/users/[id] — chặn tự nâng quyền cho chính mình", () => {
  const source = readFileSync("src/app/api/admin/users/[id]/route.ts", "utf8");

  it("khi id trùng người gọi, so role_ids gửi lên với user_roles hiện có — khác thì chặn", () => {
    expect(source).toContain('if (id === permissionCheck.user.id) {');
    expect(source).toContain('admin.from("user_roles").select("role_id").eq("user_id", id)');
    expect(source).toContain("if (!sameIdSet(roleIds, currentRoleIds))");
    expect(source).toContain("Không thể tự thay đổi vai trò của chính mình.");
  });

  it("cũng so effective_permission_ids (baseline theo role + override user_permissions) — khác thì chặn", () => {
    expect(source).toContain('admin.from("user_permissions").select("permission_id,is_allowed").eq("user_id", id)');
    expect(source).toContain('admin.from("role_permissions").select("permission_id")');
    expect(source).toContain("if (!sameIdSet(effectivePermissionIds, [...currentEffective]))");
    expect(source).toContain("Không thể tự thay đổi quyền chức năng của chính mình.");
  });

  it("vẫn giữ nguyên chặn tự ngưng hoạt động tài khoản đã có từ trước", () => {
    expect(source).toContain("Không thể tự ngưng hoạt động tài khoản của chính mình.");
  });
});
