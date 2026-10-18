import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Explicit request: "Sắp xếp lại nút Tất cả, chưa hoàn thành, hoàn thành..."
// — reorder the work-tabs row on "Việc của tôi" so the 3 status tabs read
// in the natural order (All, then Not-done, then Done) instead of the
// previous Not-done/All/Personal/.../Done order.
describe("Tasks page work-tabs: Tất cả / Chưa hoàn thành / Đã hoàn thành lead the row in that order", () => {
  const page = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("Tất cả comes before Chưa hoàn thành, which comes before Đã hoàn thành", () => {
    const allIndex = page.indexOf('tabHref("ALL")');
    const openIndex = page.indexOf('tabHref("OPEN")');
    const doneIndex = page.indexOf('tabHref("DONE")');
    expect(allIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeGreaterThan(allIndex);
    expect(doneIndex).toBeGreaterThan(openIndex);
  });

  it("Việc cá nhân (and the rest of the conditional tabs) still follow the 3 status tabs", () => {
    const doneIndex = page.indexOf('tabHref("DONE")');
    const reminderIndex = page.indexOf('tabHref("REMINDER")');
    expect(reminderIndex).toBeGreaterThan(doneIndex);
  });
});
