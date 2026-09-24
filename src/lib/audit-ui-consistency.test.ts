import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audit UI consistency fixes", () => {
  it("removes dead plan status and uses valid chart/status UI", () => {
    const plans=readFileSync("src/components/plans-client.tsx","utf8");
    const fiveS=readFileSync("src/app/(app)/monitoring/5s-tong-hop/page.tsx","utf8");
    const risk=readFileSync("src/components/risk-workflow-client.tsx","utf8");
    const fmea=readFileSync("src/components/fmea-workflow-client.tsx","utf8");
    const incidents=readFileSync("src/app/(app)/incidents/page.tsx","utf8");
    expect(plans).not.toContain('<option value="APPROVED">');
    expect(fiveS).not.toContain('tone: (total === 0 ? "muted"');
    expect(risk).toContain("<StatusBadge status={status}");
    expect(fmea).toContain("<StatusBadge status={status}");
    expect(incidents).toContain("Sự cố nghiêm trọng</span>");
    expect(incidents).toContain("Hiện chưa có hồ sơ sự cố cần ưu tiên xử lý.");
  });
});
