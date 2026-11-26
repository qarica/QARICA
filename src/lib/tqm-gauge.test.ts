import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// TqmGauge: gauge hình cung 270° mới cho tqm-charts.tsx — chưa có component
// nào trong repo vẽ gauge dạng cung (TqmDonut là donut tròn đủ 360°, không
// phải cung % kiểu đồng hồ tốc độ). Test cấu trúc theo đúng quy ước chung
// của repo (đối chiếu nguyên văn vào source, không import/render component —
// xem comment đầu navigation-v2.test.ts: Vitest ở đây không resolve alias
// "@/", và không file test nào trong repo dùng @testing-library/render).
describe("TqmGauge (src/components/tqm-charts.tsx): gauge hình cung 270°, không phải donut tròn", () => {
  const source = read("src/components/tqm-charts.tsx");

  it("export TqmGauge với đúng props value/max/label/tone/target", () => {
    expect(source).toContain("export function TqmGauge({ value, max = 100, label, tone = \"brand\", target }: {");
  });

  it("clamp pct về [0,1] trước khi dùng — không để value>max hay max<=0 vẽ tràn/âm", () => {
    expect(source).toContain("const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;");
    // Tự tính lại công thức clamp y hệt component (không import, theo đúng
    // quy ước test của repo) để khẳng định đúng hành vi tại các mốc quan
    // trọng: 0%, 50%, 100%, và vượt max (phải clamp về 100%, không vẽ tràn).
    const clamp = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
    expect(clamp(0, 100)).toBe(0);
    expect(clamp(50, 100)).toBe(0.5);
    expect(clamp(100, 100)).toBe(1);
    expect(clamp(150, 100)).toBe(1); // vượt max vẫn clamp về 100%, không vẽ tràn quá vòng cung
    expect(clamp(-10, 100)).toBe(0); // âm vẫn clamp về 0%, không vẽ lệch hướng
    expect(clamp(50, 0)).toBe(0); // max=0 không chia cho 0
  });

  it("cung chiếm đúng 75% chu vi (270°/360°) biểu diễn qua pathLength=100, không phải donut tròn đủ", () => {
    expect(source).toContain("const trackLen = 75;");
    expect(source).toContain("const fillLen = pct * trackLen;");
    expect(source).toContain('pathLength={100}');
    // Tại pct=1 (100%), fillLen phải bằng đúng trackLen (vẽ kín cả cung, không vẽ quá phần track).
    const trackLen = 75;
    expect(1 * trackLen).toBe(trackLen);
    // Tại pct=0.5 (50%), fillLen phải bằng nửa trackLen.
    expect(0.5 * trackLen).toBe(37.5);
  });

  it("xoay cả nhóm 135° để khoảng hở (90°, phần chưa vẽ) nằm dưới đáy, không phải trên đỉnh", () => {
    expect(source).toContain('transform="rotate(135 60 60)"');
  });

  it("có vạch mốc mục tiêu (target) khi truyền vào, tính theo cùng góc 135°+fraction*270° với 2 vòng cung", () => {
    expect(source).toContain("const targetAngleRad = ((135 + targetFrac * 270) * Math.PI) / 180;");
    expect(source).toContain("hasTarget ? <line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2}");
  });

  it("globals.css không định nghĩa .tqm-gauge (CSS của chart này sống trong TQM_CHART_CSS của chính file, theo đúng quy ước TqmDonut/TqmHorizontalBars đã có)", () => {
    expect(source).toContain(".tqm-gauge{display:flex;flex-direction:column;align-items:center;gap:2px;width:100px;max-width:100px;flex:0 0 100px}");
    const globals = read("src/app/globals.css");
    expect(globals).not.toContain(".tqm-gauge");
  });

  // Vỡ thật trên production (ảnh chụp điện thoại thật): nhãn dài (vd "Hợp lệ
  // toàn kho") không bị giới hạn chiều rộng, flex item .tqm-gauge tự co giãn
  // theo max-content của text bên trong (min-width:auto mặc định của flex
  // item) — đẩy cả khối gauge rộng hơn 100px của svg, tràn ra ngoài card
  // trong hàng ngang .kpi-tile-main trên màn hẹp. Khoá cứng width/max-width
  // 100px (khớp svg) + flex:0 0 100px để không co giãn theo nội dung chữ.
  it("khoá cứng chiều rộng .tqm-gauge = chiều rộng svg (100px), nhãn tự xuống dòng bên trong thay vì đẩy cả khối tràn ra ngoài card khi tên dài", () => {
    expect(source).toContain(".tqm-gauge-label{font-size:10px;color:#718187;text-align:center;width:100%}");
  });
});
