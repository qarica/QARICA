import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Real report: "Đã có 1 số biểu mẫu đã số hóa nhưng báo cáo vẫn 0" — the
// Biểu mẫu category page's "Đã số hóa" KPI counted the generic status field
// (TODO/IN_PROGRESS/DONE/BLOCKED), while the table's own "Tình trạng số hóa"
// column reads the independent details.digitized select field a user can
// set without ever touching the generic status dropdown — so rows already
// shown as "Đã số hóa" in the table never counted toward the KPI.
describe("EMR Biểu mẫu 'Đã số hóa' KPI also counts details.digitized, not just the generic status field", () => {
  const source = readFileSync("src/components/emr-category-client.tsx", "utf8");

  it("treats digitized==='Đã số hóa' as DONE for BIEU_MAU, same pattern CHU_KY_SO already uses details.certificate_expiry instead of status", () => {
    expect(source).toContain('function isBieuMauDigitized(item: Item): boolean { return item.details?.digitized === "Đã số hóa"; }');
    expect(source).toContain('const done = (i: Item) => i.status === "DONE" || (categoryCode === "BIEU_MAU" && isBieuMauDigitized(i));');
  });

  it("DONE/IN_PROGRESS/TODO/OVERDUE buckets all route through the same done() helper so a digitized row never double-counts into a not-done bucket", () => {
    expect(source).toContain('case "DONE": return items.filter(done).length;');
    expect(source).toContain('case "IN_PROGRESS": return items.filter((i) => !done(i) && i.status === "IN_PROGRESS").length;');
    expect(source).toContain('case "TODO": return items.filter((i) => !done(i) && (i.status === "TODO" || (!hasBlockedBucket && i.status === "BLOCKED"))).length;');
    expect(source).toContain('case "OVERDUE": return items.filter((i) => !done(i) && i.due_date && i.due_date < today).length;');
  });

  it("does not change what DONE means outside the KPI card — go-live gate verification keeps reading the real status field", () => {
    const route = readFileSync("src/app/api/emr/items/[id]/route.ts", "utf8");
    expect(route).toContain('if (effectiveStatus !== "DONE" || !effectiveEvidence)');
    expect(route).not.toContain("digitized");
  });
});
