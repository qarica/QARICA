import { describe, expect, it } from "vitest";
import { buildMonitoringCsv, exportFileName } from "./monitoring-export";

describe("monitoring CSV export", () => {
  it("exports UTF-8 BOM, Vietnamese content and escaped quotes", () => {
    const csv = buildMonitoringCsv([["Tên bảng kiểm", "Giám sát 5S"]], [{
      section: "Sàng lọc",
      content: 'Tủ có nhãn "đúng"',
      result: "Đạt",
      note: "Ổn",
    }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Giám sát 5S"');
    expect(csv).toContain('"Tủ có nhãn ""đúng"""');
  });

  it("neutralizes spreadsheet formulas", () => {
    const csv = buildMonitoringCsv([], [{ section: "5S", content: "=1+1", result: "Đạt" }]);
    expect(csv).toContain('"\'=1+1"');
  });

  it("creates a safe file name", () => {
    expect(exportFileName("GS 5S/01")).toBe("ket-qua-GS-5S-01.csv");
  });
});
