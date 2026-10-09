import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu thực tế: "E back lại tất cả biểu mẫu đang có về chưa duyệt để anh
// duyệt lại" — đảo ngược backfill PUBLISHED của migration 20261031 cho đúng
// category='BIEU_MAU', không đụng các danh mục EMR khác dùng chung cột.
describe("EMR Biểu mẫu — reset publish_status về DRAFT để duyệt lại thủ công", () => {
  const migration = read("supabase/migrations/20261102_emr_bieu_mau_reset_to_draft_v1.sql");

  it("chỉ update category='BIEU_MAU', đưa publish_status về DRAFT và xoá published_at/published_by", () => {
    expect(migration).toContain("set publish_status = 'DRAFT', published_at = null, published_by = null");
    expect(migration).toContain("where category = 'BIEU_MAU';");
  });

  it("không xoá/động tới department_ids, record_types hay status — chỉ khoá sửa qua gate PATCH đã có sẵn", () => {
    expect(migration).not.toMatch(/department_ids\s*=/);
    expect(migration).not.toMatch(/\bstatus\s*=\s*'/);
    expect(migration).not.toContain("details");
  });
});
