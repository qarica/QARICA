import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi người dùng kèm ảnh chụp "Trung tâm Điều hành EMR" và "Audit HSBA"
// ở dark mode: "Dark có nghĩa là màu nền tối chứ ko phải là các nút tối và
// nền sáng như cũ, các chữ tối khi sáng phải sáng khi tối mới thấy được."
// Gốc lỗi: 2 trang này tự định nghĩa màu cứng (hex) trong <style> riêng của
// component (không dùng các lớp CSS dùng chung đã có override dark-theme.css
// từ trước) — đây CHÍNH LÀ phạm vi đã công bố "CHƯA PHỦ" khi ra mắt nút
// chuyển giao diện (xem theme-toggle.test.ts). Vá 2 trang cụ thể người dùng
// báo lỗi: emr-command-center.tsx (thêm thẳng override vào <style> riêng của
// component — component này đã dùng plain <style>, không phải styled-jsx,
// nên không có vấn đề scope) và hsba-audit-overview-client.tsx (2 màu cứng
// còn lại đặt trong dark-theme.css thay vì trong <style jsx> của component,
// để không phụ thuộc cách styled-jsx tự thêm class scope vào selector có
// tiền tố ancestor [data-theme=dark]).
describe("Dark mode — vá màu cứng ở 2 trang bị báo lỗi qua ảnh chụp (EMR Command Center, Audit HSBA)", () => {
  const command = read("src/components/emr-command-center.tsx");
  const hsba = read("src/components/hsba-audit-overview-client.tsx");
  const darkCss = read("src/app/dark-theme.css");

  it("EMR Command Center: nền panel/kpi/filter/table đổi tối, không còn trắng cứng", () => {
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-panel{background:#1a1f26');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-kpi{background:#1a1f26');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-filters span{background:#1a1f26');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-matrix-panel th{background:#1f2730');
    expect(command).toContain('[data-theme="dark"] .emr-command .ready-card{border-color:#2a333c;background:#1a1f26}');
  });

  it("EMR Command Center: mọi heading/label màu xanh đậm (vd #092b68, #0a2d69, #082b6c) đều có bản dark đổi sang màu sáng, không còn chữ tối trên nền tối", () => {
    expect(command).toContain('[data-theme="dark"] .emr-command{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-title h2{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-kpi strong{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .emr-panel-head h2{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .donut b{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .ready-main strong{color:#e6e9ec}');
    expect(command).toContain('[data-theme="dark"] .emr-command .action-list strong{color:#e6e9ec}');
  });

  it("EMR Command Center: các badge/tag nền nhạt (ready-icon, pill, action-icon, em.ok/warn/work) có bản dark dùng tông soft tương ứng, không còn nền trắng/be với chữ tối", () => {
    expect(command).toContain('[data-theme="dark"] .emr-command .ready-icon.green{background:#163428;color:#6ee7b7}');
    expect(command).toContain('[data-theme="dark"] .emr-command .ready-icon.red{background:#3a1f20;color:#fca5a5}');
    expect(command).toContain('[data-theme="dark"] .emr-command .pill.good{background:#163428;color:#6ee7b7}');
    expect(command).toContain('[data-theme="dark"] .emr-command .pill.mid{background:#3a2f14;color:#fcd34d}');
    expect(command).toContain('[data-theme="dark"] .emr-command .action-icon{background:#3a1f20;color:#fca5a5}');
  });

  it("Audit HSBA: 2 màu cứng còn lại (.hsba-owner-pick, .hsba-category-row td) có override trong dark-theme.css, không đặt trong <style jsx> của component", () => {
    expect(hsba).toContain("color: #64748b;"); // bản sáng gốc giữ nguyên, không sửa trực tiếp trong component
    expect(darkCss).toContain('[data-theme="dark"] .workspace-app .hsba-owner-pick{color:#8d98a3!important}');
    expect(darkCss).toContain('[data-theme="dark"] .workspace-app .hsba-category-row td{background:#1f2730!important;color:#aab4bf!important}');
  });
});
