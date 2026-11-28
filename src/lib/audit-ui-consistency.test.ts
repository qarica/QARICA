import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audit UI consistency fixes", () => {
  it("uses valid chart/status UI", () => {
    const fiveS=readFileSync("src/app/(app)/monitoring/5s-tong-hop/page.tsx","utf8");
    const risk=readFileSync("src/components/risk-workflow-client.tsx","utf8");
    const fmea=readFileSync("src/components/fmea-workflow-client.tsx","utf8");
    const incidents=readFileSync("src/app/(app)/incidents/page.tsx","utf8");
    expect(fiveS).not.toContain('tone: (total === 0 ? "muted"');
    expect(risk).toContain("<StatusBadge status={status}");
    expect(fmea).toContain("<StatusBadge status={status}");
    // Danh sách "Hồ sơ cần chú ý" đã gộp vào bảng sự cố (khuôn Kho hóa chất): cờ nghiêm trọng và trạng thái rỗng nằm ở bảng/Kanban.
    const table=readFileSync("src/components/incident-registry-table.tsx","utf8");
    expect(table).toContain('<span className="incident-serious-flag">⚠ Nghiêm trọng</span>');
    expect(table).toContain("Không có hồ sơ phù hợp.");
    expect(incidents).toContain("<em>⚠ Sự cố nghiêm trọng</em>");
  });
});
