import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoriesReferencing, EMR_CATEGORIES, EMR_CATEGORY_FIELDS, EMR_CATEGORY_KPIS } from "./emr-categories";

// Regression for a requested feature: a new EMR category for user-guide /
// instruction documents ("Tài liệu hướng dẫn"), optionally ("không bắt
// buộc") linked to a specific Biểu mẫu item. Reuses the SAME generic
// "reference" field mechanism already built for Lỗi -> Biểu mẫu, rather than
// inventing a second link mechanism — and the link is optional the same way
// every other reference field already is (nothing in the UI/API requires a
// value).
describe("EMR — Tài liệu hướng dẫn (TAI_LIEU_HUONG_DAN) category", () => {
  it("is declared in EMR_CATEGORIES with a slug, label and icon", () => {
    const cat = EMR_CATEGORIES.find((c) => c.code === "TAI_LIEU_HUONG_DAN");
    expect(cat).toBeTruthy();
    expect(cat?.slug).toBe("tai-lieu-huong-dan");
    expect(cat?.label).toBe("Tài liệu hướng dẫn");
  });

  it("has KPI buckets like every other category (no special-cased dashboard code needed)", () => {
    expect(EMR_CATEGORY_KPIS.TAI_LIEU_HUONG_DAN?.length).toBeGreaterThan(0);
    expect(EMR_CATEGORY_KPIS.TAI_LIEU_HUONG_DAN?.some((k) => k.bucket === "TOTAL")).toBe(true);
  });

  it("declares related_form_id as an OPTIONAL reference to Biểu mẫu — the generic reference field type, not a new link mechanism", () => {
    const field = EMR_CATEGORY_FIELDS.TAI_LIEU_HUONG_DAN.find((f) => f.key === "related_form_id");
    expect(field).toBeTruthy();
    expect(field?.type).toBe("reference");
    expect(field?.referenceCategory).toBe("BIEU_MAU");
  });

  it("Biểu mẫu automatically gets a reverse 'N tài liệu hướng dẫn liên quan' link via categoriesReferencing(), with no Biểu mẫu-side config needed", () => {
    const incoming = categoriesReferencing("BIEU_MAU");
    expect(incoming.some((r) => r.category === "TAI_LIEU_HUONG_DAN" && r.field.key === "related_form_id")).toBe(true);
  });

  it("the DB check constraint was widened to allow this category, following the same pattern used for Patient Portal", () => {
    const migration = readFileSync("supabase/migrations/20261003_emr_rollout_items_tai_lieu_huong_dan_category_v1.sql", "utf8");
    expect(migration).toContain("'TAI_LIEU_HUONG_DAN'");
    expect(migration).toContain("emr_rollout_items_category_check check (category in (");
  });

  it("is reachable via the shared EMR workspace nav and category detail page — no separate page/route built for it", () => {
    const categoryPage = readFileSync("src/app/(app)/emr/[category]/page.tsx", "utf8");
    expect(categoryPage).toContain("emrCategoryBySlug(slug)");
  });
});
