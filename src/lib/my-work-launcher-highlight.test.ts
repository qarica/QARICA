import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Yêu cầu tường minh: sau khi xác nhận icon "Việc của tôi" đã hết dính màu
// ngoài ý muốn (topbar-icon-active-tint-leak.test.ts), người dùng làm rõ
// họ MUỐN icon này nổi bật để dễ tìm — khác hẳn bug trước đó. Tô nền brand
// navy CỐ ĐỊNH cho launcher này (không phụ thuộc pathname), để không lặp
// lại cơ chế "active" theo route đã bị gỡ bỏ có chủ đích.
describe("Icon \"Việc của tôi\" ở topbar nổi bật có chủ đích (không phải bug active-state)", () => {
  const finalLock = readFileSync("src/app/final-visual-lock.css", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  it("my-work-launcher có nền brand navy cố định, không phải trắng như các icon khác", () => {
    expect(finalLock).toContain(".workspace-app .header-icon.my-work-launcher{background:var(--brand)!important;border-color:var(--brand)!important;color:#fff!important}");
  });

  it("vẫn giữ hover/focus đồng bộ màu nổi bật, không rơi về trắng mặc định của .header-icon", () => {
    expect(finalLock).toContain(".workspace-app .header-icon.my-work-launcher:hover,\n.workspace-app .header-icon.my-work-launcher:focus,\n.workspace-app .header-icon.my-work-launcher:focus-visible{background:#15306e!important;border-color:#15306e!important;color:#fff!important;box-shadow:none!important}");
  });

  it("className của my-work-launcher trong app-shell.tsx vẫn tĩnh (không quay lại pathname.startsWith(...) ? \"active\" : \"\")", () => {
    expect(shell).toContain('className="icon-button header-icon my-work-launcher"');
  });
});
