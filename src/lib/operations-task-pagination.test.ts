import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

function safePage(raw: string | undefined) {
  const requestedPage = Number(raw ?? 1);
  return Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
}

describe("Operations /tasks pagination", () => {
  it("rejects invalid and unsafe page inputs", () => {
    for (const value of ["NaN", "Infinity", "-1", "0", "1.5", "9007199254740992"]) {
      expect(safePage(value)).toBe(1);
    }
    expect(safePage(undefined)).toBe(1);
    expect(safePage("2")).toBe(2);
  });

  it("guards the page query before calculating row slices", () => {
    expect(source).toContain("Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1");
    expect(source).toContain("const currentPage=Math.min(page,totalPages)");
    expect(source).toContain("searched.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE)");
  });
});
