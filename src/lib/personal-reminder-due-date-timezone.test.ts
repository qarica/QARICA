import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Bug: "Việc sắp đến hạn" (và nhãn OVERDUE/ngày hạn của note cá nhân trong
// bảng "Tất cả") hiện sai lùi 1 ngày so với note thật (vd note hạn 08/10 lại
// hiện 07/10). personal-reminders.tsx lưu due_at bằng
// new Date(`${due}T00:00:00`).toISOString() — nửa đêm giờ VN (UTC+7) quy đổi
// UTC lùi về 17h hôm trước — nên dateOnly() cắt 10 ký tự đầu của due_at lấy
// nhầm NGÀY UTC thay vì ngày giờ VN người dùng thực sự chọn. Phải quy đổi qua
// hcmDateKey() (src/lib/hcm-date.ts), không cắt chuỗi thô.
describe("Note cá nhân (personal_reminders.due_at): ngày hiển thị phải theo giờ VN, không cắt chuỗi UTC thô", () => {
  const files = ["src/app/(app)/tasks/page.tsx", "src/app/(app)/calendar/my-work/page.tsx"];

  it.each(files)("%s: dateOnly() quy đổi due_at qua hcmDateKey, không còn chỉ .slice(0,10)", (path) => {
    const content = read(path);
    expect(content).toContain('import { hcmDateKey } from "@/lib/hcm-date";');
    expect(content).toMatch(/dateOnly\(value:?\s*string\)\s*\{\s*return value\.length\s*>\s*10\s*\?\s*\(hcmDateKey\(value\)\s*\|\|\s*value\.slice\(0,\s*10\)\)\s*:\s*value;?\s*\}/);
  });
});
