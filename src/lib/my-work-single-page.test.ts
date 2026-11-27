import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Việc của tôi: một trang duy nhất + ngày dd/mm/yyyy", () => {
  it("/calendar/my-work chỉ chuyển hướng về /tasks, không còn trang trùng", () => {
    const page = read("src/app/(app)/calendar/my-work/page.tsx");
    expect(page).toContain('redirect("/tasks")');
    expect(page).not.toContain("loadMyAssignedWork");
  });
  it("thanh điều hướng Lịch không còn tab Việc của tôi", () => {
    expect(read("src/app/(app)/calendar/layout.tsx")).not.toContain("/calendar/my-work");
  });
  it.each(["src/components/personal-reminders.tsx", "src/components/unified-personal-task-actions.tsx"])("%s dùng LabDateInput, không dùng input type=date", (p) => {
    const c = read(p);
    expect(c).toContain("LabDateInput");
    expect(c).not.toContain('type="date"');
  });
  it("CSS ô ngày dùng chung có trong globals.css", () => {
    expect(read("src/app/globals.css")).toContain(".ls-date>input[type=text]");
  });
});

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
function walk(d: string): string[] { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; }); }
describe("Toàn hệ thống nhập ngày dd/mm/yyyy", () => {
  it("không còn <input type=\"date\"> trần ngoài 2 component ô ngày dùng chung", () => {
    const offenders = walk("src").filter((f) => !/vn-date-input|lab-supplies-date-input/.test(f) && /<input[^>]*\stype="date"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
