import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMR_CATEGORIES } from "./emr-categories";

// Regression for a real bug found via code/migration archaeology: PATIENT_PORTAL was
// added to EMR_CATEGORIES (and rendered by the EMR overview + /emr/patient-portal page)
// without ever widening the emr_rollout_items.category check constraint, so creating a
// Patient Portal item failed at the database. This reads every migration that defines
// or replaces that constraint, in filename (chronological) order, and checks the LAST
// one in effect lists every category code the application actually uses - so a future
// category added to emr-categories.ts without a matching migration fails this test
// instead of failing silently in production.
describe("emr_rollout_items.category check constraint matches EMR_CATEGORIES", () => {
  it("the latest migration touching the category constraint allows every EmrCategoryCode", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const constraintFiles = files.filter((f) => {
      const sql = readFileSync(`${dir}/${f}`, "utf8");
      return /category\s+(text\s+not\s+null\s+)?check\s*\(\s*category\s+in\s*\(/i.test(sql)
        || /add\s+constraint\s+emr_rollout_items_category_check/i.test(sql);
    });
    expect(constraintFiles.length).toBeGreaterThan(0);
    const latest = constraintFiles[constraintFiles.length - 1];
    const sql = readFileSync(`${dir}/${latest}`, "utf8");
    const match = sql.match(/category\s+in\s*\(([^)]+)\)/i);
    expect(match, `expected a "category in (...)" list in ${latest}`).toBeTruthy();
    const allowed = new Set((match![1].match(/'([A-Z_]+)'/g) || []).map((s) => s.slice(1, -1)));
    for (const c of EMR_CATEGORIES) {
      expect(allowed.has(c.code), `${c.code} (from EMR_CATEGORIES) missing in ${latest}'s check constraint`).toBe(true);
    }
  });
});
