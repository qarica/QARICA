import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for a requested feature: the EMR overview "Từ ngày"/"Đến ngày"
// filter used to start empty (unfiltered). The user asked it to default to
// "đầu năm -> hôm nay" while staying fully editable — not a fixed/locked
// range, just a sensible starting point.
describe("EMR overview — due-date filter defaults to year-start..today", () => {
  const command = readFileSync("src/components/emr-command-center.tsx", "utf8");

  it("defaults 'from' to the first day of the current year and 'to' to today (Asia/Ho_Chi_Minh), both still plain useState (editable)", () => {
    expect(command).toContain("function hcmToday(){return new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"Asia/Ho_Chi_Minh\"}).format(new Date());}");
    expect(command).toContain("const [from,setFrom]=useState(`${todayKey.slice(0,4)}-01-01`); const [to,setTo]=useState(todayKey);");
  });

  it("loads the dashboard with this default range on mount instead of unfiltered", () => {
    expect(command).toContain("useEffect(()=>{load(from,to)},[]);");
  });

  it("the date inputs remain plain editable controlled inputs, not disabled/readOnly", () => {
    expect(command).not.toMatch(/Từ ngày[\s\S]{0,120}readOnly/);
    expect(command).not.toMatch(/Từ ngày[\s\S]{0,120}disabled/);
  });
});
