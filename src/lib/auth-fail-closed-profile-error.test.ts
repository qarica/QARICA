import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lỗi nghiêm trọng đã xác nhận trong production: requireUserContext() (cổng
// auth dùng cho MỌI trang được bảo vệ) chưa từng kiểm tra profileResult.error
// trước khi dùng profileResult.data. Query profiles từng embed
// `departments(name)` qua quan hệ (PostgREST relationship embed) — profiles
// có nhiều hơn 1 FK trỏ tới departments nên PostgREST không tự biết chọn
// quan hệ nào, trả lỗi "could not embed" (HTTP 300). Vì error bị nuốt lặng
// lẽ, profile rơi về null → organizationId rơi về null → mọi query hạ nguồn
// lọc .eq("organization_id", null) chạy tiếp với ngữ cảnh sai (Công văn,
// HSBA, mua sắm, hành nghề... đồng loạt trả rỗng/sai) thay vì dừng hẳn
// request. Sửa: (1) bỏ hẳn embed departments(...) qua profiles — tra tên
// khoa/phòng bằng 1 query riêng theo primary_department_id, giống quy ước
// mọi route khác trong codebase; (2) fail-closed — throw ngay khi
// profileResult.error có giá trị, không âm thầm tiếp tục với profile=null.
describe("requireUserContext — fail-closed khi query profiles lỗi, không còn embed departments(...) ambiguous", () => {
  const source = readFileSync("src/lib/auth.ts", "utf8");

  it("không còn embed departments(...) qua quan hệ của profiles (nguồn gây PostgREST 300 do nhiều FK)", () => {
    expect(source).not.toMatch(/profiles.*departments\(name\)|departments\(name\).*profiles/);
    expect(source).not.toContain("profile?.departments?.name");
  });

  it("tra tên khoa/phòng bằng 1 query riêng theo primary_department_id, không qua embed", () => {
    expect(source).toContain('supabase.from("departments").select("name").eq("id", profile.primary_department_id).maybeSingle()');
    expect(source).toContain("(departmentResult.data as any)?.name ?? null");
  });

  it("fail-closed: throw ngay khi profileResult.error có giá trị, trước khi đọc profileResult.data", () => {
    const errorCheckIndex = source.indexOf("if (profileResult.error)");
    const dataReadIndex = source.indexOf("const profile = profileResult.data");
    expect(errorCheckIndex).toBeGreaterThan(-1);
    expect(dataReadIndex).toBeGreaterThan(-1);
    expect(errorCheckIndex).toBeLessThan(dataReadIndex);
    expect(source).toContain("throw new Error(`Không tải được hồ sơ người dùng: ${profileResult.error.message}`);");
  });

  it("vẫn ghi log lỗi ra console trước khi throw (quan sát được trên Vercel logs)", () => {
    expect(source).toContain('console.error("[requireUserContext] profiles query failed:", profileResult.error.message);');
  });
});
