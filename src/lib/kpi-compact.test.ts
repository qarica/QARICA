import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Ô chỉ số gọn dùng chung cho các menu (không đụng Kho)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("ô gọn: đệm nhỏ, không chiều cao tối thiểu, viền màu bên trái theo tông, ẩn biểu tượng lớn", () => {
    expect(css).toContain("border-left:3px solid var(--tone-blue);border-radius:12px;padding:10px 14px;min-height:0;display:flex;flex-direction:column;gap:0}");
    expect(css).toContain(".kpi-tile .kpi-icon{display:none}");
    for (const t of ["blue", "green", "amber", "red", "purple"]) expect(css).toContain(`.kpi-tile.tone-${t}{border-left-color:var(--tone-${t})}`);
    expect(css).toContain(".kpi-tile-value{font-size:26px;font-weight:800;line-height:1}");
  });
  it("KpiCard gắn lớp tông lên ô để có viền màu", () => {
    expect(readFileSync("src/components/kpi-card.tsx", "utf8")).toContain("kpi-tile tone-${tone}");
  });
  it("Kho giữ giao diện riêng: không dùng KpiCard/kpi-tile của các menu khác", () => {
    for (const f of ["src/components/lab-supplies-stock.tsx", "src/components/lab-supplies-client.tsx", "src/components/lab-supplies-alerts.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/KpiCard|kpi-tile|kpi-grid/);
    }
  });
});
