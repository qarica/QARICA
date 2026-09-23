import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Calendar Assessment milestones", () => {
  it("uses real assessment_rounds deadline columns and never queries legacy end_date", () => {
    const source = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");
    expect(source).toContain("submission_deadline");
    expect(source).toContain("review_deadline");
    expect(source).toContain("finalization_date");
    expect(source).not.toContain('assessment_rounds")\n      .select("id,record_id,work_year,start_date,end_date');
    expect(source).not.toContain("round.end_date");
  });
});
