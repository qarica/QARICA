import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Tài khoản thủ kho (chỉ có lab_supplies.view/manage) không được xem dữ liệu module khác dù gõ thẳng URL hay gọi API.
describe("cách ly vai trò chỉ có menu Kho", () => {
  const pages: [string, string][] = [
    ["document-publications", 'requirePermission(user, "document_publication.view")'],
    ["incoming-documents", 'requirePermission(user, "incoming_documents.view")'],
    ["physician-license", 'requirePermission(user, "physician_license.view")'],
    ["procurement", 'requirePermission(user, "procurement.view")'],
    ["work-plans", 'requirePermission(user, "work_plans.view")'],
  ];
  for (const [dir, guard] of pages) {
    it(`trang /${dir} kiểm tra quyền xem ở cấp trang`, () => {
      const src = read(`src/app/(app)/${dir}/page.tsx`);
      expect(src).toContain(guard);
      expect(src.indexOf(guard)).toBeLessThan(src.indexOf("createClient()") === -1 ? Infinity : src.indexOf("createClient()"));
    });
  }
  it("trang Đào tạo và Tự đọc hiểu kiểm tra procedure_training.view hoặc document_publication.view", () => {
    for (const dir of ["procedure-trainings", "tu-doc-hieu"]) {
      const src = read(`src/app/(app)/${dir}/page.tsx`);
      expect(src, dir).toContain('hasAnyPermission(user, ["procedure_training.view", "document_publication.view"])');
      expect(src, dir).toContain('redirect("/dashboard?forbidden=1")');
    }
  });
  it("/api/work chỉ cho người có tasks.view", () => {
    expect(read("src/app/api/work/route.ts")).toContain('requireApiContext("tasks.view")');
  });
  it("/api/search lọc kết quả hồ sơ theo quyền xem từng loại", () => {
    const s = read("src/app/api/search/route.ts");
    expect(s).toContain("requireApiContext()");
    expect(s).toContain("canViewRecordType(auth.context.user,r.record_type)");
    expect(s).not.toContain("requireApiUser");
  });
});
