import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Báo cáo thực tế (ảnh chụp, /calendar): "Ko xem được các việc quá nhiều ko
// click xem được" — ô "+N mốc khác" khi một ngày có quá 4 mốc chỉ là <div>
// tĩnh, không có href/onClick nào, nên không có cách nào xem các mốc còn lại
// trong ô tháng. Chuyển sang Link tới weekHref(date) — cùng ngày đó ở chế độ
// Tuần hiện TOÀN BỘ mốc, không giới hạn 4 (xem calendar-week-col trong cùng
// file: dayEvents.map(...) không slice/truncate).
describe("Calendar (/calendar) — ô \"+N mốc khác\" phải bấm xem được", () => {
  const source = read("src/app/(app)/calendar/page.tsx");

  it("ô +N mốc khác là Link tới weekHref(date), không còn là <div> tĩnh", () => {
    expect(source).toContain('<Link href={weekHref(date)} className="calendar-more" title={`Xem đủ ${dayEvents.length} mốc ngày ${formatShortDate(date)} ở chế độ Tuần`}>+{dayEvents.length - 4} mốc khác →</Link>');
    expect(source).not.toContain('<div className="calendar-more">+{dayEvents.length - 4} mốc khác</div>');
  });

  it(".calendar-more có style/cursor báo hiệu có thể bấm, không còn là text thường", () => {
    expect(source).toContain(".calendar-more{display:block;font-size:9px;color:#172554;margin-top:5px;font-weight:750;text-decoration:none;cursor:pointer}");
  });

  // Explicit request: "dời Calendar thành 1 nút riêng để dễ xem lịch" — cùng
  // cách "Việc của tôi" đã được đưa ra topbar (xem navigation-v2.test.ts).
  it("Lịch QLCL không còn nằm trong accordion ĐIỀU HÀNH CHẤT LƯỢNG của sidebar chính", () => {
    const navigation = read("src/lib/navigation.ts");
    const block = navigation.slice(navigation.indexOf('id: "operations"'), navigation.indexOf('id: "quality-management"'));
    expect(block).not.toContain('label: "Lịch QLCL"');
  });

  it("có nút Lịch QLCL riêng trên topbar, dẫn tới /calendar", () => {
    const shell = read("src/components/app-shell.tsx");
    expect(shell).toContain('href="/calendar" prefetch={true} className="icon-button header-icon calendar-launcher"');
    expect(shell).toContain('<Icon name="calendar-days" size={18} /></Link>');
  });
});

// Báo cáo thực tế (ảnh chụp, /analytics): "2 nút icon lệch nền" — 2 trong 5
// icon-badge ở hàng exec-kpis (Tổng số sự cố/Sự cố nghiêm trọng/Rủi ro mức
// cao/CAPA đúng hạn/Tỷ lệ đạt mục tiêu) hiện lệch khỏi tâm nền tròn/vuông của
// nó. Xác minh bằng cách dựng lại đúng CSS + markup thật trong trình duyệt
// headless và đo offset tâm <svg> so với tâm .kpi-icon: TRƯỚC khi sửa, cả 5
// icon lệch đều -8.5px cả 2 trục (không phải chỉ 2 cái — nhưng độ lệch rõ
// nhất ở 2 icon có hình dạng sắc cạnh, phần còn lại khó nhận ra hơn vì hình
// tròn/gần-đối-xứng). Nguyên nhân: `.tqm-analytics .exec-kpis .kpi span`
// (một type-selector span bắt luôn cả span bọc icon) có specificity (0,3,1)
// — CAO HƠN `.tqm-analytics .exec-kpis .kpi-icon` (0,3,0) vì thiếu 1 lớp
// `.kpi` cha so với đúng quy ước mọi trang kpi khác trong repo này đã dùng
// (`.scope .kpi .kpi-icon`, xem capa/incidents/evidence/improvement/risks
// page.tsx) — khiến display:block đè mất display:flex, icon không còn được
// căn giữa trong nền màu.
// 2026-11-13: exec-kpis/kpis trên trang này chuyển sang <KpiCard> dùng
// chung (Stage C redesign) — root cause ở trên (selector .kpi span thắng
// specificity trước .kpi-icon do thiếu 1 lớp .kpi cha) không còn áp dụng
// được nữa vì trang không còn tự định nghĩa .kpi/.kpi-icon/.kpi span riêng
// nào: toàn bộ icon giờ dùng đúng 1 rule .kpi-icon.<tone> chung trong
// globals.css (không có type-selector `span` cạnh tranh specificity).
describe("Báo cáo & Phân tích QLCL (/analytics) — icon KPI hàng exec-kpis lệch khỏi nền (đã chuyển sang KpiCard dùng chung)", () => {
  const source = read("src/app/(app)/analytics/page.tsx");

  it("không còn tự định nghĩa .kpi/.kpi-icon/.exec-kpis .kpi riêng — dùng KpiCard + .kpi-icon.<tone> chung của globals.css", () => {
    expect(source).toContain('import { KpiCard } from "@/components/kpi-card";');
    expect(source).not.toMatch(/\.tqm-analytics \.exec-kpis \.kpi\{/);
    expect(source).not.toMatch(/\.tqm-analytics \.kpi\{/);
    expect(source).not.toMatch(/\.tqm-analytics \.kpi-icon\{/);
    const globals = read("src/app/globals.css");
    expect(globals).toContain(".kpi-icon.blue{background:var(--tone-blue-soft);color:var(--tone-blue)}");
    expect(globals).toContain(".kpi-icon.purple{background:var(--tone-purple-soft);color:var(--tone-purple)}");
  });
});
