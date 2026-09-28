import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality calendar kind filters", () => {
  const source = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");

  it("supports independent show/hide toggles per source while preserving month navigation", () => {
    expect(source).toContain("hidden?: string");
    expect(source).toContain("hiddenKinds");
    expect(source).toContain("!hiddenKinds.has(event.kind)");
    expect(source).toContain("monthHref");
    expect(source).toContain("toggleKindHref");
    expect(source).toContain("href={monthHref(year,month)}");
    expect(source).not.toContain('| "PLAN"');
    expect(source).not.toContain(',"PLAN"');
  });

  it("keeps Action, personal reminders and operational event sources available", () => {
    for (const label of ["Action","Nhắc việc","Kế hoạch","Đánh giá","Báo cáo","Giám sát","Tiếp đoàn","Sổ tay QLCL"]) {
      expect(source).toContain(label);
    }
  });
});
