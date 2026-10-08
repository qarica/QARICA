import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu: "Chưa có nút điều chỉnh light hay dark giao diện". Thêm nút chuyển
// giao diện sáng/tối ở topbar, lưu lựa chọn vào localStorage, và một script
// đồng bộ trong <head> chạy TRƯỚC hydrate để tránh nhấp nháy sáng rồi mới tối
// (FOUC) mỗi lần tải lại trang cho người đã chọn giao diện tối.
//
// Phạm vi bản đầu: khung sườn dùng chung (sidebar/topbar/workspace-strip) và
// các lớp CSS dùng chung trong globals.css (.panel, .kpi-card, table,
// .modal-card, .button, input/select/textarea, .status-badge, .alert, trang
// đăng nhập...) đã có giao diện tối đầy đủ. Các trang tự định nghĩa màu cứng
// riêng trong <style> của từng component (EMR, Dashboard, Gantt, TQM
// charts...) CHƯA được phủ — sẽ cần rà và bổ sung riêng từng trang ở vòng sau.
describe("Nút chuyển giao diện sáng/tối", () => {
  it("ThemeToggle lưu lựa chọn vào localStorage và set data-theme lên <html>", () => {
    const toggle = read("src/components/theme-toggle.tsx");
    expect(toggle).toContain('const STORAGE_KEY = "qlcl-theme";');
    expect(toggle).toContain('document.documentElement.setAttribute("data-theme", next);');
    expect(toggle).toContain("window.localStorage.setItem(STORAGE_KEY, next);");
  });

  it("được gắn vào topbar của AppShell (hiện trên mọi trang, không riêng 1 module)", () => {
    const shell = read("src/components/app-shell.tsx");
    expect(shell).toContain('import { ThemeToggle } from "@/components/theme-toggle";');
    expect(shell).toContain("<ThemeToggle />");
  });

  it("layout gốc chạy script đồng bộ data-theme từ localStorage trong <head>, trước khi React hydrate — chống nhấp nháy sáng rồi mới tối", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('localStorage.getItem("qlcl-theme")');
    expect(layout).toContain('document.documentElement.setAttribute("data-theme","dark")');
    expect(layout).toContain("<script dangerouslySetInnerHTML={{__html:themeInitScript}}/>");
    expect(layout.indexOf("<head>")).toBeLessThan(layout.indexOf("<body>"));
  });

  it("dark-theme.css được nạp sau cùng (sau final-visual-lock.css) để thắng mọi lớp CSS kế thừa", () => {
    const layout = read("src/app/layout.tsx");
    const finalLockIdx = layout.indexOf('import "./final-visual-lock.css";');
    const darkThemeIdx = layout.indexOf('import "./dark-theme.css";');
    expect(finalLockIdx).toBeGreaterThan(-1);
    expect(darkThemeIdx).toBeGreaterThan(finalLockIdx);
  });

  it("Icon component có sẵn icon sun/moon cho nút", () => {
    const icon = read("src/components/icon.tsx");
    expect(icon).toContain('"sun":Sun,"moon":Moon');
  });

  it("dark-theme.css phủ khung sườn dùng chung (sidebar/topbar) và các lớp dùng chung của globals.css", () => {
    const css = read("src/app/dark-theme.css");
    expect(css).toContain(':root[data-theme="dark"]{');
    expect(css).toContain('[data-theme="dark"] .workspace-app .sidebar{');
    expect(css).toContain('[data-theme="dark"] .panel{');
    expect(css).toContain('[data-theme="dark"] .modal-card{');
  });
});
