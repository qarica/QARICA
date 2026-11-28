import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// EMR và HSBA theo khuôn Kho hóa chất ở mức HIỂN THỊ: thanh "Cần xử lý" + ô chỉ số bấm để lọc danh sách.
// Không đụng logic Go-live gate (isGatePassed ở API dashboard) hay ranh giới quyền emr.view/emr.manage.
const read = (p: string) => readFileSync(p, "utf8");

describe("EMR hạng mục: Cần xử lý + ô chỉ số lọc danh sách", () => {
  const client = read("src/components/emr-category-client.tsx");
  it("ô chỉ số, thanh Cần xử lý và bộ lọc danh sách dùng chung bucketMatcher (không lệch số)", () => {
    expect(client).toContain("function bucketMatcher(bucket: EmrKpiBucket, hasBlockedBucket: boolean, categoryCode: string)");
    expect(client).toContain("return items.filter(bucketMatcher(bucket, hasBlockedBucket, categoryCode)).length;");
    expect(client).toContain(".filter(bucketMatcher(attention, hasBlockedBucket, categoryCode));");
    expect(client).toContain("?filter=OVERDUE");
  });
  it("trang hạng mục vẫn yêu cầu emr.view; không thêm thao tác ghi", () => {
    const page = read("src/app/(app)/emr/[category]/page.tsx");
    expect(page).toContain('requirePermission(user, "emr.view");');
    expect(page).toContain("<EmrCategoryClient attention={attention}");
  });
});

describe("HSBA: Cần xử lý theo bước xử lý lỗi", () => {
  it("đủ 4 bước và lọc danh sách Lỗi cần xử lý", () => {
    const c = read("src/components/hsba-audit-overview-client.tsx");
    expect(c).toContain('sent: ["SENT_TO_DEPT"], disputed: ["DEPT_DISPUTED"]');
    expect(c).toContain("{shownFindings.map((f) => (");
    expect(read("src/app/(app)/hsba-audit/page.tsx")).toContain("attention={attention}");
  });
});

describe("EMR Biểu mẫu: lọc theo ô chỉ số khớp số trên ô", () => {
  it("khi lọc theo ô, loại bản nháp giống kpiItems", () => {
    const src = read("src/components/emr-category-client.tsx");
    expect(src).toContain('const kpiItems = categoryCode === "BIEU_MAU" ? items.filter((i) => i.publish_status !== "DRAFT") : items;');
    expect(src).toMatch(/if \(attention && attention !== "TOTAL"\) rows = rows\.filter\(\(i\) => !\(categoryCode === "BIEU_MAU" && i\.publish_status === "DRAFT"\)\)\.filter\(bucketMatcher/);
  });
});
