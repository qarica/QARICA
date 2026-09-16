import { describe, expect, it } from "vitest";
import { buildTqmCsv, tqmCsvFileName } from "./tqm-csv";

describe("TQM CSV export", () => {
  it("exports UTF-8 BOM, metadata and supplied filtered rows", () => {
    const csv = buildTqmCsv({
      metadata: [["Bộ lọc", "Đang xử lý"], ["Số dòng", 1]],
      headers: ["Mã", "Nội dung"],
      rows: [["CAPA-2026-00001", "Khắc phục quy trình"]],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Bộ lọc";"Đang xử lý"');
    expect(csv).toContain("CAPA-2026-00001");
  });

  it("neutralizes spreadsheet formulas in user-entered values", () => {
    const csv = buildTqmCsv({ headers: ["Nội dung"], rows: [["=HYPERLINK(\"bad\")"], ["+cmd"], ["@owner"]] });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@owner");
  });

  it("creates stable filenames", () => {
    expect(tqmCsvFileName("capa-theo-doi", 2026)).toBe("capa-theo-doi-2026.csv");
  });
});
