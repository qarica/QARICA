import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: ảnh chụp sidebar cho thấy nhiều nhãn nhóm điều hướng dài
// ("ĐIỀU HÀNH CHẤT LƯỢNG", "QUẢN LÝ CHẤT LƯỢNG", "QUẢN LÝ HÀNH NGHỀ",
// "QUẢN LÝ CÔNG VĂN", "QUẢN LÝ VĂN BẢN", "MUA SẮM & SỬA CHỮA") đồng thời bị
// wrap xuống 2 dòng — hành vi wrap-không-cắt-chữ này là chủ đích (xem
// app-shell.tsx, .nav-group-link .nav-link-label{white-space:normal}), nhưng
// ở độ rộng sidebar cũ thì wrap xảy ra quá thường xuyên, trông lộn xộn. Người
// dùng chọn hướng "nới rộng sidebar" thay vì bỏ wrap.
//
// Đo bằng Playwright (font 14px/800, .nav-group-label) cho thấy nhãn dài nhất
// ("KIỂM SOÁT NHIỄM KHUẨN", naturalWidth 190px) cần availableWidth >= 190px;
// ở sidebar 248px (quy tắc "RC12" trong qms-enterprise-redesign.css — quy tắc
// thực sự thắng cascade, xem CLAUDE.md mục cascade-collision) availableWidth
// chỉ có 133px. Phần chrome cố định (margin+padding+icon+gap) quanh
// .nav-group-label tiêu tốn đúng 248-133=115px bất kể sidebar rộng bao nhiêu,
// nên nới sidebar lên 320px (320-115=205px, dư ~15px so với nhãn dài nhất) đủ
// để mọi nhãn còn lại nằm 1 dòng. Đồng bộ con số 320px ở MỌI nơi khai báo độ
// rộng sidebar desktop để tránh lặp lại đúng kiểu xung đột cascade đã từng gặp
// (xem CLAUDE.md gotcha). KHÔNG đụng tới các quy tắc chỉ áp dụng ở
// @media(max-width:860px)/900px (drawer mobile, vốn đã dùng công thức riêng
// min(292px,88vw) hoặc 266px cho .sidebar.collapsed) — đó là mối quan tâm
// khác (độ rộng drawer trên điện thoại), không phải sidebar desktop.
describe("Sidebar desktop: nới rộng 320px đồng bộ ở mọi nơi khai báo, không đụng tới quy tắc mobile", () => {
  it("app-shell.tsx: --sidebar-width và fallback left: đều là 320px, không còn 266px", () => {
    const shell = read("src/components/app-shell.tsx");
    expect(shell).toContain("--sidebar-width:320px");
    expect(shell).toContain("left:var(--sidebar-width,320px)");
    expect(shell).not.toContain("266px");
  });

  it("qms-enterprise-redesign.css: cả khối sidebar cũ (276px) và khối RC12 đang thắng cascade (248px) đều đổi thành 320px", () => {
    const css = read("src/app/qms-enterprise-redesign.css");
    expect(css).not.toContain("276px");
    expect(css).not.toContain("248px");
    expect(css).toContain(".workspace-app .sidebar{\n  width:320px!important;");
    expect(css).toContain(".workspace-app .main-shell{margin-left:320px!important}\n.workspace-app .sidebar-brand{");
    expect(css).toContain(".workspace-app .sidebar{width:320px!important;box-shadow:4px 0 18px rgba(27,67,112,.045)!important}");
    expect(css).toContain(".workspace-app .main-shell{margin-left:320px!important}\n.workspace-app .sidebar-brand{min-height:68px");
    // Quy tắc mobile (@media(max-width:860px)) giữ nguyên, không bị đụng tới.
    expect(css).toContain(".workspace-app .sidebar{width:min(292px,88vw)!important}");
  });

  it("globals.css: .sidebar/.main-shell nền (fallback trước khi .workspace-app áp dụng) cũng là 320px", () => {
    const globals = read("src/app/globals.css");
    expect(globals).toContain(".sidebar{position:fixed;inset:0 auto 0 0;z-index:40;width:320px");
    expect(globals).toContain(".main-shell{min-height:100vh;margin-left:320px}");
    expect(globals).not.toContain("width:266px");
    expect(globals).not.toContain("margin-left:266px");
  });

  it("transitions.css: .route-progress trùng vị trí với sidebar desktop mới (320px), vẫn bỏ qua ở mobile (@media(max-width:900px))", () => {
    const transitions = read("src/app/transitions.css");
    expect(transitions).toContain(".route-progress{position:fixed;top:0;left:320px");
    expect(transitions).toContain("@media(max-width:900px){.route-progress{left:0}}");
  });

  it("qlvb-theme.css: .sidebar.collapsed vẫn giữ 266px — đây là drawer mobile (@media(max-width:860px)), khác với sidebar desktop nên không đổi theo", () => {
    const qlvb = read("src/app/qlvb-theme.css");
    expect(qlvb).toContain("@media(max-width:860px)");
    expect(qlvb).toContain(".sidebar.collapsed{width:266px!important}");
  });
});
