import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard domain query scoping", () => {
  it("filters domain tables by the current work-year record ids at the database query", () => {
    const source=readFileSync("src/app/(app)/dashboard/page.tsx","utf8");
    for(const table of ["indicator_measurements","improvement_projects","findings","capas","incidents"]){
      const marker='from("'+table+'")';
      const start=source.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source.slice(start,start+260)).toContain('.in("record_id",recordIdList)');
    }
    expect(source).toContain('const recordIdList=records.map');
  });
});
