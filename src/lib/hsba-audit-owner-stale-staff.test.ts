import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện Thấp: dropdown "Nhân viên phụ trách" chỉ liệt kê nhân sự ĐANG
// hoạt động của khoa (department-staff/route.ts lọc is_active=true) — nếu
// người đã gán trước đó đã ngưng hoạt động hoặc đổi khoa/phòng, dropdown
// không có option khớp giá trị owner_user_id hiện tại, hiện ra như "chưa
// gán" dù DB vẫn lưu đúng. Cùng nguyên tắc "groupOptions" đã dùng cho Nhóm
// gáy (luôn giữ giá trị hiện tại trong danh sách dù không còn đạt điều kiện
// chọn mới) — resolve tên không lọc is_active ở trang server, luôn hiện
// đúng option ở client dù không còn trong danh sách nhân sự đang hoạt động.
describe("HSBA audit — dropdown Nhân viên phụ trách không hiện sai khi người đã gán ngưng hoạt động/đổi khoa", () => {
  const page = read("src/app/(app)/hsba-audit/page.tsx");
  const client = read("src/components/hsba-audit-overview-client.tsx");

  it("trang server resolve owner_name không lọc is_active (khác hẳn department-staff chỉ liệt kê active)", () => {
    expect(page).toContain('await supabase.from("profiles").select("user_id,full_name,email").in("user_id", ownerIds)');
    expect(page).not.toMatch(/ownersRes[\s\S]{0,80}is_active/);
    expect(page).toContain("owner_name: f.owner_user_id ? ownerName.get(f.owner_user_id) || null : null");
  });

  it("dropdown luôn thêm option cho người đã gán nếu họ không còn trong danh sách nhân sự đang hoạt động của khoa", () => {
    expect(client).toContain("!(staffByDept[f.department_id] || []).some((s) => s.id === f.owner_user_id)");
    expect(client).toContain("đã ngưng hoạt động/đổi khoa");
  });

  it("owner_name có trong type Finding và được cập nhật lạc quan sau khi gán lại", () => {
    expect(client).toContain("owner_name: string | null;");
    expect(client).toContain("owner_name: newOwnerName");
  });
});
