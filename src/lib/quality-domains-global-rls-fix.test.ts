import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ưu tiên #2 của audit giao diện QARICA được 1 fork thực hiện đã tạo migration
// 20261112000000 thêm policy SELECT cho quality_domains bằng
// `organization_id = private.current_organization_id()`. Nhưng quality_domains
// là danh mục CỐ ĐỊNH DÙNG CHUNG toàn hệ thống (10 lĩnh vực chất lượng & an
// toàn, cùng nguyên tắc với EMR_CATEGORIES đã ghi trong CLAUDE.md) — xác nhận
// trực tiếp trên Supabase sống: cả 10 dòng đều có organization_id = NULL.
// `NULL = x` luôn là NULL (falsy) trong SQL, nên policy đó không bao giờ khớp
// — mọi user qua client thường (vừa đổi từ admin sang ở cùng đợt sửa ưu tiên
// #2) đều thấy 0 dòng. Đã verify bằng Playwright: widget "Tình trạng theo
// lĩnh vực" ở Dashboard hiện rỗng. Route API sẵn có
// src/app/api/records/[id]/quality-domains/route.ts đã dùng đúng pattern
// "global-hoặc-tổ-chức-hiện-tại" từ trước (.or("organization_id.is.null,
// organization_id.eq.<org>")) — migration RLS lẽ ra nên theo đúng pattern đó
// ngay từ đầu. Migration sửa (20261112010000) thêm lại đúng vế NULL.
describe("Fix: quality_domains RLS policy không còn loại trừ danh mục dùng chung (organization_id IS NULL)", () => {
  const migration = readFileSync(
    "supabase/migrations/20261112010000_quality_domains_global_rls_fix_v1.sql",
    "utf8",
  );

  it("drop lại policy cũ trước khi tạo lại (idempotent, không áp 2 lần bị lỗi duplicate)", () => {
    expect(migration).toContain("drop policy if exists qlcl_authenticated_select on public.quality_domains;");
  });

  it("policy mới cho phép xem cả danh mục dùng chung (organization_id IS NULL) lẫn danh mục riêng tổ chức", () => {
    expect(migration).toContain("organization_id is null");
    expect(migration).toContain("or organization_id = private.current_organization_id()");
  });

  it("đúng cùng pattern global-hoặc-tổ-chức đã dùng sẵn cho quality_domains ở route API khác (records/[id]/quality-domains)", () => {
    const route = readFileSync("src/app/api/records/[id]/quality-domains/route.ts", "utf8");
    expect(route).toContain("organization_id.is.null,organization_id.eq.");
  });
});
