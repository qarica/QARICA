import { describe, expect, it } from "vitest";
import { buildRegistryCsv, registryExportFileName } from "./registry-export";

describe("registry export", () => {
  it("exports only supplied filtered rows with UTF-8 BOM and metadata", () => {
    const csv = buildRegistryCsv({
      recordType: "FINDING",
      year: 2026,
      query: "Khoa A",
      status: "ACTIVE",
      rows: [{
        record_type: "FINDING",
        record_code: "FND-2026-00001",
        title: "Điểm không phù hợp",
        lifecycle_status: "ACTIVE",
        department_name: "Khoa A",
        owner_name: "Nguyễn Văn A",
        created_at: "2026-09-15T01:00:00Z",
        updated_at: "2026-09-16T02:00:00Z",
      }],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Từ khóa lọc";"Khoa A"');
    expect(csv).toContain('"Số hồ sơ xuất";"1"');
    expect(csv).toContain("FND-2026-00001");
  });

  it("neutralizes spreadsheet formulas from user-entered text", () => {
    const csv = buildRegistryCsv({
      recordType: "RISK",
      year: 2026,
      rows: [{
        record_type: "RISK",
        record_code: "RSK-1",
        title: "=HYPERLINK(\"bad\")",
        lifecycle_status: "ACTIVE",
        department_name: "+cmd",
        owner_name: "@owner",
        created_at: null,
        updated_at: null,
      }],
    });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@owner");
  });

  it("creates stable Excel-compatible filenames", () => {
    expect(registryExportFileName("AUDIT", 2026)).toBe("danh-sach-audit-2026.csv");
  });
});
