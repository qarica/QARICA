import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Thanh lọc nhanh của "Việc của tôi": hàng đợi cần xử lý (Đang mở → Quá hạn → Hôm nay → 7 ngày tới → Chờ phản hồi) đứng trước,
// rồi Đã xong và Tất cả. Thay cho 7 tab cũ; cùng cách xếp cột với Kanban theo hạn.
describe("Việc của tôi: thứ tự nút lọc nhanh", () => {
  const page = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("Đang mở, Quá hạn, Hôm nay, 7 ngày tới, Chờ phản hồi, Đã xong, Tất cả theo đúng thứ tự", () => {
    const keys: [string, string][] = [["OPEN", "Đang mở"], ["OVERDUE", "Quá hạn"], ["TODAY", "Hôm nay"], ["NEXT7", "7 ngày tới"], ["WAITING", "Chờ phản hồi"], ["DONE", "Đã xong"], ["ALL", "Tất cả"]];
    const idx = keys.map(([k, label]) => page.indexOf(`["${k}","${label}"`));
    for (const i of idx) expect(i).toBeGreaterThan(-1);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  it("mỗi nút hiện số đếm và là liên kết giữ nguyên tìm kiếm/tuần/cách xem", () => {
    expect(page).toContain("href={tabHref(key)}");
    expect(page).toContain("{label} <b>{count}</b>");
  });
});
