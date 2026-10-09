import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORIES, EMR_CATEGORY_FIELDS, EMR_CATEGORY_KPIS } from "./emr-categories";

// Regression: the user decided the "Nhập liệu" (NHAP_LIEU) EMR category was
// unnecessary (it tracked historical paper-record data-entry migration,
// distinct from — and not actually needed alongside — Biểu mẫu's form
// digitization tracking) and asked to remove it entirely. Per CLAUDE.md's
// single-source-of-truth rule, removal must reach every place that knew
// about the category: the type union, the category list, its KPI buckets,
// its own fields, AND the database rows/constraint/storage files it owned
// — not just hidden from the menu.
describe("EMR — Nhập liệu (NHAP_LIEU) category fully removed", () => {
  it("is gone from EMR_CATEGORIES, EMR_CATEGORY_KPIS and EMR_CATEGORY_FIELDS", () => {
    expect(EMR_CATEGORIES.some((c) => (c.code as string) === "NHAP_LIEU")).toBe(false);
    expect((EMR_CATEGORY_KPIS as Record<string, unknown>).NHAP_LIEU).toBeUndefined();
    expect((EMR_CATEGORY_FIELDS as Record<string, unknown>).NHAP_LIEU).toBeUndefined();
    // 9 real categories remain: the 8 pre-existing minus NHAP_LIEU, plus the
    // later-added TAI_LIEU_HUONG_DAN (Tài liệu hướng dẫn).
    expect(EMR_CATEGORIES.length).toBe(9);
  });

  it("the source file no longer mentions the removed category's code or its fields", () => {
    const source = readFileSync("src/lib/emr-categories.ts", "utf8");
    expect(source).not.toContain("NHAP_LIEU");
    expect(source).not.toContain("record_count");
    // "Nhập liệu" was that removed category's own label — banned outright
    // back then. It later returned for an UNRELATED reason: a phương thức
    // ký (signing method) option on signing_sequence.methodOptions meaning
    // "ký bằng cách điền tay/nhập liệu", not a revival of the category. Pin
    // the check to the category's own label shape so this test still catches
    // an actual revival without false-failing on that coincidence.
    expect(source).not.toContain('label: "Nhập liệu"');
    expect(source).not.toContain('code: "NHAP_LIEU"');
  });

  it("a migration deletes NHAP_LIEU rows (and their storage files) and narrows the DB check constraint to match — no orphaned data left behind", () => {
    const migration = readFileSync("supabase/migrations/20261002_emr_rollout_items_remove_nhap_lieu_category_v1.sql", "utf8");
    expect(migration).toContain("delete from storage.objects");
    expect(migration).toContain("name like '%/emr/NHAP_LIEU/%'");
    expect(migration).toContain("delete from public.emr_rollout_items where category = 'NHAP_LIEU'");
    expect(migration).toContain("emr_rollout_items_category_check check (category in (");
    expect(migration).not.toContain("'NHAP_LIEU'," );
  });
});
