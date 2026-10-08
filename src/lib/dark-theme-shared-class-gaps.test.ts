import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi người dùng: ảnh chụp trang Kế hoạch (plans-client.tsx) ở dark mode
// cho thấy thanh toolbar (bộ lọc + nút "Xuất Excel") vẫn nền trắng dù các ô
// input/select/button bên trong đã đổi màu — gây cảm giác "mờ/khó đọc". Gốc
// lỗi: nhiều file CSS tải TRƯỚC dark-theme.css (qarica-design-system.css,
// qms-enterprise-redesign.css, final-visual-lock.css) có rule dạng
// `.workspace-app .toolbar{background:#fff!important}` — độ đặc hiệu (3 lớp
// hoặc hơn, vd .workspace-app .status-badge.warning) BẰNG hoặc CAO HƠN các
// rule dark-theme.css ban đầu (vd .status-badge.muted không có tiền tố
// .workspace-app), nên dark-theme.css không thắng được dù nạp sau cùng. Sửa
// bằng cách thêm tiền tố .workspace-app vào mọi rule bị ảnh hưởng để độ đặc
// hiệu LUÔN cao hơn bản gốc, không phụ thuộc thứ tự nạp.
describe("dark-theme.css — vá các lớp dùng chung bị nền sáng ghi đè bởi CSS tải trước", () => {
  const css = read("src/app/dark-theme.css");

  it("table/table-wrap/toolbar trong .workspace-app (vd trang Kế hoạch) đổi nền tối", () => {
    expect(css).toContain('[data-theme="dark"] .workspace-app table{background:var(--surface)!important}');
    expect(css).toContain('[data-theme="dark"] .workspace-app .table-wrap{background:var(--surface)!important');
    expect(css).toContain('[data-theme="dark"] .workspace-app .toolbar{background:var(--surface)!important');
  });

  it("modal-head và panel-title (qarica-design-system.css / qms-enterprise-redesign.css ghi đè #fff) có bản vá độ đặc hiệu cao hơn", () => {
    expect(css).toContain('[data-theme="dark"] .workspace-app .modal-head{background:#1a1f26!important');
    expect(css).toContain('[data-theme="dark"] .workspace-app .panel-title{background:transparent!important');
  });

  it("fieldset và main-shell không còn nền sáng cứng trong dark mode", () => {
    expect(css).toContain('[data-theme="dark"] .workspace-app fieldset{background:transparent!important');
    expect(css).toContain('[data-theme="dark"] .workspace-app .main-shell{background:var(--bg)!important}');
  });

  it("đủ 4 biến thể màu .status-badge (success/danger/warning/info) đều có bản vá .workspace-app, không chỉ riêng muted", () => {
    expect(css).toContain('[data-theme="dark"] .workspace-app .status-badge.success{');
    expect(css).toContain('[data-theme="dark"] .workspace-app .status-badge.danger{');
    expect(css).toContain('[data-theme="dark"] .workspace-app .status-badge.warning{');
    expect(css).toContain('[data-theme="dark"] .workspace-app .status-badge.info{');
    expect(css).toContain('[data-theme="dark"] .workspace-app .status-badge.muted{');
  });

  it("search-box lúc focus (:focus-within) cũng có bản vá, không chỉ trạng thái tĩnh", () => {
    expect(css).toContain('[data-theme="dark"] .workspace-app .search-box:focus-within{background:#1a1f26!important');
  });
});
