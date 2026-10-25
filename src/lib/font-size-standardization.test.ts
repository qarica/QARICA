import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Chuẩn hoá toàn bộ giá trị font-size (px) lẻ/thập phân trong app về thang cố
// định 9/10/11/12/13/14px (headings/brand >=15px giữ nguyên, ngoài phạm vi).
// Quy tắc làm tròn: tới rung gần nhất, đúng giữa thì làm tròn LÊN. Vùng in ấn
// (@media print, .print-*, trang .../print/page.tsx, monitoring-print-compact.css)
// không đụng tới — layout in ấn được canh riêng cho khổ giấy.
describe("Chuẩn hoá font-size lẻ về thang cố định (ngoài vùng in ấn)", () => {
  it("globals.css: các giá trị .5 đã làm tròn (10.5->11, 9.5->10)", () => {
    const source = read("src/app/globals.css");
    expect(source).not.toContain("font-size:10.5px");
    expect(source).not.toContain("font-size:9.5px");
  });

  it("qarica-readability.css: nhóm giá trị lẻ (10.5/10.8/11.5/12.5/13.5) đã làm tròn, 15.5px (heading, ngoài phạm vi) giữ nguyên", () => {
    const source = read("src/app/qarica-readability.css");
    expect(source).not.toContain("10.5px");
    expect(source).not.toContain("10.8px");
    expect(source).not.toContain("11.5px");
    expect(source).not.toContain("12.5px");
    expect(source).not.toContain("13.5px");
    expect(source).toContain("15.5px");
  });

  it("calendar/page.tsx: 9.3px và 9.5px (ngoài vùng in) đã làm tròn lên 9px/10px, các mốc 8px đã sửa ở commit trước không bị động lại", () => {
    const source = read("src/app/(app)/calendar/page.tsx");
    expect(source).not.toContain("font-size:9.3px");
    expect(source).not.toContain("font-size:9.5px");
    expect(source).toContain(".calendar-mini-weekday{text-align:center;font-size:9px");
    expect(source).toContain(".calendar-holiday-name{font-size:10px");
  });

  it("app-shell.tsx: nav-group-header/nav-group-link 13.5px đã làm tròn lên 14px", () => {
    const source = read("src/components/app-shell.tsx");
    expect(source).not.toContain("font-size:13.5px");
    expect(source).toContain("font-size:14px!important");
  });

  it("five-s-checklist-preview-client.tsx: 12.5px/13.5px đã làm tròn thành 13px/14px", () => {
    const source = read("src/components/five-s-checklist-preview-client.tsx");
    expect(source).not.toContain("12.5px");
    expect(source).not.toContain("13.5px");
  });

  it("monitoring/[id]/page.tsx: các giá trị lẻ (7px/7.5px/8px/8.5px) bên trong @media print vẫn giữ nguyên — vùng in ấn ngoài phạm vi", () => {
    const source = read("src/app/(app)/monitoring/[id]/page.tsx");
    expect(source).toContain(".monitoring-status-panel .subline{font-size:8.5px!important}");
    expect(source).toContain(".monitoring-round-page .kpi-card small{font-size:7.5px!important;line-height:1.15!important}");
  });

  it("monitoring-print-compact.css: toàn bộ file nằm trong @media print nên các giá trị lẻ (6.5px/7px/7.5px) giữ nguyên", () => {
    const source = read("src/app/monitoring-print-compact.css");
    expect(source).toContain("font-size:6.5px!important");
    expect(source).toContain("font-size:7px!important");
    expect(source).toContain("font-size:7.5px!important");
  });

  it("incidents/[id]/print/page.tsx: 10.5px/9.5px bên trong @media print của trang in sự cố giữ nguyên", () => {
    const source = read("src/app/(app)/incidents/[id]/print/page.tsx");
    expect(source).toContain(".ipr-row span,.ipr-row strong{font-size:10.5px}");
    expect(source).toContain(".ipr-table{font-size:9.5px}");
  });

  it("loading.tsx: inline fontSize 11.5 (React style prop) đã làm tròn thành 12", () => {
    const source = read("src/app/loading.tsx");
    expect(source).not.toContain("fontSize:11.5");
    expect(source).toContain("fontSize:12");
  });
});
