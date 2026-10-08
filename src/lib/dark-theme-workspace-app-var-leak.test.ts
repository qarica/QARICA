import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Lỗi gốc sâu hơn phát hiện khi rà ảnh dark-mode trang Kế hoạch: không chỉ
// riêng .toolbar/.table thiếu bản vá — TOÀN BỘ rule trong dark-theme.css dùng
// var(--surface)/var(--bg)/var(--text)/var(--muted) (vd .panel, .kpi-card)
// đều KHÔNG có tác dụng bên trong .workspace-app, vì qarica-design-system.css
// và qms-enterprise-redesign.css tự gán lại các biến này NGAY TRÊN chính
// ".workspace-app" (".workspace-app{--surface:var(--qms-surface)!important}")
// — biến bị gán lại tại gốc kế thừa mới này, không phải thua trong một cuộc
// đua specificity giữa 2 rule cùng áp dụng cho 1 phần tử, nên thứ tự nạp file
// hay độ đặc hiệu của riêng từng rule con (.panel, .toolbar...) không cứu
// được. Phải gán lại đúng giá trị tối ngay trên .workspace-app.
describe("dark-theme.css — không bị qarica-design-system.css/qms-enterprise-redesign.css gán đè biến --surface/--bg/--text trên .workspace-app", () => {
  const css = read("src/app/dark-theme.css");

  it("có rule [data-theme=dark] .workspace-app gán lại toàn bộ token màu (không chỉ ở :root)", () => {
    const block = css.slice(css.indexOf('[data-theme="dark"] .workspace-app{'), css.indexOf('[data-theme="dark"] .workspace-app{') + 600);
    expect(block).toContain("--bg:#11151a!important");
    expect(block).toContain("--surface:#1a1f26!important");
    expect(block).toContain("--text:#e6e9ec!important");
    expect(block).toContain("--muted:#8d98a3!important");
    expect(block).toContain("--line:#2a333c!important");
    expect(block).toContain("--field-line:#3a434d!important");
    expect(block).toContain("--field-focus:#4f8ff7!important");
    expect(block).toContain("--brand-soft:#1b2b44!important");
    expect(block).toContain("--danger-soft:#3a1f20!important");
    expect(block).toContain("--warning-soft:#3a2f14!important");
    expect(block).toContain("--success-soft:#163428!important");
    expect(block).toContain("--info-soft:#17283d!important");
  });

  it('rule gán lại nằm SAU khối :root[data-theme="dark"] gốc (không thay thế, chỉ bổ sung ở cấp .workspace-app)', () => {
    const rootIdx = css.indexOf(':root[data-theme="dark"]{');
    const wsIdx = css.indexOf('[data-theme="dark"] .workspace-app{');
    expect(rootIdx).toBeGreaterThan(-1);
    expect(wsIdx).toBeGreaterThan(rootIdx);
  });
});
