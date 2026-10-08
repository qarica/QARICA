import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Trước đây physician-license/registrations/[id] chỉ có PATCH cho action
// REGISTER — khai báo nhầm tên/vai trò/ngày hiệu lực thì không có cách sửa
// hay xoá, phải sống chung với dữ liệu sai. Thêm action UPDATE (sửa) + DELETE
// (xoá), cả 2 chỉ cho phép khi còn PENDING — đã REGISTERED là dữ liệu tuân
// thủ đã ghi nhận, khoá lại giống các module khác.
describe("Theo dõi hành nghề: sửa/xoá bản ghi khai báo nhầm", () => {
  const route = read("src/app/api/physician-license/registrations/[id]/route.ts");

  it("có action UPDATE để sửa thông tin, chỉ khi còn PENDING", () => {
    expect(route).toContain('if (body.action === "UPDATE")');
    expect(route).toContain('if (current.status !== "PENDING") return NextResponse.json({ error: "Chỉ sửa được bản ghi chưa đăng ký (PENDING)." }');
  });

  it("UPDATE tính lại deadline bằng đúng công thức dùng chung với POST (không lệch 2 nơi)", () => {
    expect(route).toContain('import { computeDeadline } from "@/lib/physician-license";');
    expect(route).toContain("const deadline = computeDeadline(effectiveDate, roleType, caseType);");
    const postRoute = read("src/app/api/physician-license/registrations/route.ts");
    expect(postRoute).toContain('import { computeDeadline } from "@/lib/physician-license";');
  });

  it("có DELETE, chỉ khi còn PENDING, scoped theo organization_id", () => {
    expect(route).toContain("export async function DELETE(");
    expect(route).toContain('if (current.status !== "PENDING") return NextResponse.json({ error: "Chỉ xoá được bản ghi chưa đăng ký (PENDING)." }');
    expect(route).toContain('.eq("organization_id", organizationId).eq("status", "PENDING");');
  });

  it("cả PATCH và DELETE đều yêu cầu physician_license.manage, không phải .view", () => {
    const patchFn = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
    const deleteFn = route.slice(route.indexOf("export async function DELETE"));
    expect(patchFn).toContain('requireApiPermission("physician_license.manage")');
    expect(deleteFn).toContain('requireApiPermission("physician_license.manage")');
  });

  it("UI có nút Sửa/Xoá cho bản ghi PENDING và form sửa inline", () => {
    const client = read("src/components/physician-license-client.tsx");
    expect(client).toContain("async function saveEdit(reg: Registration)");
    expect(client).toContain("async function removeRegistration(reg: Registration)");
    expect(client).toContain('action: "UPDATE"');
    expect(client).toContain('method: "DELETE"');
  });
});
