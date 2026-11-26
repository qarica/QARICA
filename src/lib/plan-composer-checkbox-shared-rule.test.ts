import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo audit UI/UX: checkbox "Có nhiệm vụ con" (task-title-line) đã bọc
// đúng .inline-check (sizing đã đúng chuẩn từ đầu), nhưng component vẫn tự
// viết thêm 1 rule CSS riêng (`width:16px!important`...) đè lên, trùng lặp
// không cần thiết với rule chung .inline-check input trong globals.css —
// 2 nguồn CSS cho cùng 1 kích thước checkbox, rủi ro lệch nhau nếu 1 trong
// 2 đổi sau này mà quên chỗ kia (CLAUDE.md nguyên tắc 2). Bỏ rule riêng,
// chỉ còn dựa vào .inline-check chung.
describe("plan-composer-client — checkbox 'Có nhiệm vụ con' chỉ dựa vào rule .inline-check chung, không override riêng", () => {
  const source = readFileSync("src/components/plan-composer-client.tsx", "utf8");

  it("không còn tự viết input[type=\"checkbox\"]{width:16px!important...} riêng cho task-title-line", () => {
    expect(source).not.toContain('input[type="checkbox"]{width:16px!important');
  });

  it("checkbox vẫn bọc đúng className=\"inline-check\"", () => {
    expect(source).toContain('<label className="inline-check"');
  });
});
