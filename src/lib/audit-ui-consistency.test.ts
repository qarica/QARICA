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
    expect(incidents).toContain("Sự cố nghiêm trọng</span>");
    expect(incidents).toContain("Hiện chưa có hồ sơ sự cố cần ưu tiên xử lý.");
  });
});
