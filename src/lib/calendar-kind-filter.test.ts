import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality calendar kind filters", () => {
  const source = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");

  it("supports a validated kind query while preserving month navigation", () => {
    expect(source).toContain("kind?: string");
    expect(source).toContain("CalendarKindFilter");
    expect(source).toContain('kindFilter === "ALL" || event.kind === kindFilter');
    expect(source).toContain("monthHref");
    expect(source).toContain("kindHref");
    expect(source).toContain("href={monthHref(year,month)}");
    expect(source).not.toContain('| "PLAN"');
    expect(source).not.toContain(',"PLAN"');
  });

  it("keeps Action, personal reminders and operational event filters available", () => {
    for (const label of ["Tất cả","Action","Nhắc việc","Kế hoạch","Đánh giá","Báo cáo","Giám sát","Tiếp đoàn","Định kỳ"]) {
      expect(source).toContain(label);
    }
  });
});
