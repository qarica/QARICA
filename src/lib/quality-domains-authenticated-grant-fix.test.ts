import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ ảnh chụp production thật của người dùng (mobile): banner đỏ
// "permission denied for table quality_domains" trên /improvement/projects.
// Xác nhận trực tiếp trên Supabase sống (information_schema.role_table_grants):
// quality_domains/record_quality_domain_links/incident_lessons_learned đều
// có policy SELECT đúng (20261112000000) nhưng KHÔNG có GRANT SELECT cấp
// bảng cho authenticated — "permission denied" xảy ra TRƯỚC khi RLS kịp
// đánh giá, khác hẳn lỗi RLS trả về 0 dòng (đã sửa riêng ở
// quality-domains-global-rls-fix.test.ts). Nguồn gốc: migration gốc
// (20260917) của cả 3 bảng đều `revoke all ... from authenticated` lúc tạo
// bảng (chủ đích service-role-only khi đó); migration sau thêm policy
// SELECT nhưng quên khôi phục GRANT.
describe("Fix: quality_domains/record_quality_domain_links/incident_lessons_learned thiếu GRANT SELECT cho authenticated (khác lỗi RLS trả rỗng)", () => {
  const migration = readFileSync(
    "supabase/migrations/20261130000003_quality_domains_authenticated_grant_fix_v1.sql",
    "utf8",
  );

  it("grant select cho authenticated trên đúng 3 bảng đã bị revoke all lúc tạo nhưng chỉ thêm lại policy, chưa thêm lại grant", () => {
    expect(migration).toContain("grant select on table public.quality_domains to authenticated;");
    expect(migration).toContain("grant select on table public.record_quality_domain_links to authenticated;");
    expect(migration).toContain("grant select on table public.incident_lessons_learned to authenticated;");
  });

  it("3 bảng này đều có policy SELECT cho authenticated (20261112000000) — grant mới không thừa, không bỏ sót bảng nào có policy mà thiếu grant", () => {
    const policyMigration = readFileSync(
      "supabase/migrations/20261112000000_quality_domain_links_lessons_rls_select_v1.sql",
      "utf8",
    );
    for (const table of ["quality_domains", "record_quality_domain_links", "incident_lessons_learned"]) {
      expect(policyMigration).toContain(`on public.${table}`);
    }
  });
});
