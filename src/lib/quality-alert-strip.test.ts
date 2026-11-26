import { describe, expect, it } from "vitest";
import { buildQualityAlertItems } from "./quality-alert-strip";

const BASE = {
  capaOverdueCount: 0,
  outTargetIndicatorCount: 0,
  auditNearDueCount: 0,
  auditNearDueFirstEndDate: null as string | null,
  investigatingCount: 0,
  docReviewOverdueCount: 0,
  today: "2026-11-13",
};

describe("buildQualityAlertItems (promoted from dashboard/page.tsx's inline alerts array)", () => {
  it("trả về mảng rỗng khi mọi con số đều 0", () => {
    expect(buildQualityAlertItems(BASE)).toEqual([]);
  });

  it("chỉ gồm các mục có số > 0, đúng thứ tự CAPA → chỉ số → audit → RCA → văn bản", () => {
    const items = buildQualityAlertItems({
      ...BASE,
      capaOverdueCount: 3,
      investigatingCount: 2,
      docReviewOverdueCount: 1,
    });
    expect(items.map((i) => i.href)).toEqual(["/capa", "/incidents", "/document-publications"]);
  });

  it("CAPA quá hạn: tone đỏ, số đúng trong tiêu đề, link /capa", () => {
    const [item] = buildQualityAlertItems({ ...BASE, capaOverdueCount: 5 });
    expect(item).toMatchObject({ tone: "red", title: "5 CAPA đã quá hạn", href: "/capa" });
  });

  it("chỉ số vượt ngưỡng: tone vàng, link /indicators", () => {
    const [item] = buildQualityAlertItems({ ...BASE, outTargetIndicatorCount: 4 });
    expect(item).toMatchObject({ tone: "amber", title: "4 chỉ số vượt ngưỡng", href: "/indicators" });
  });

  it("audit sắp đến hạn: tone tím, sub hiện ngày dự kiến khi có, rỗng khi không", () => {
    const withDate = buildQualityAlertItems({ ...BASE, auditNearDueCount: 2, auditNearDueFirstEndDate: "2026-11-20" });
    expect(withDate[0]).toMatchObject({ tone: "purple", sub: "Dự kiến: 2026-11-20" });
    const withoutDate = buildQualityAlertItems({ ...BASE, auditNearDueCount: 2, auditNearDueFirstEndDate: null });
    expect(withoutDate[0]).toMatchObject({ tone: "purple", sub: "" });
  });

  it("sự cố đang điều tra RCA: tone xanh dương, link /incidents", () => {
    const [item] = buildQualityAlertItems({ ...BASE, investigatingCount: 7 });
    expect(item).toMatchObject({ tone: "blue", title: "7 sự cố đang điều tra RCA", href: "/incidents" });
  });

  it("văn bản cần xem xét lại: tone đỏ, link /document-publications", () => {
    const [item] = buildQualityAlertItems({ ...BASE, docReviewOverdueCount: 2 });
    expect(item).toMatchObject({ tone: "red", title: "2 văn bản cần xem xét lại", href: "/document-publications" });
  });
});
