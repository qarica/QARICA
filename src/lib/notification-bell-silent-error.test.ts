import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Báo cáo thực tế: "Chuông báo ko hoạt động" — không thấy badge, danh sách
// trống, bấm vào không thấy phản hồi gì. Rà code: load() lấy cả 2 truy vấn
// (danh sách thông báo + đếm chưa đọc) qua Promise.all nhưng KHÔNG kiểm tra
// error của cả 2 — nếu RLS/kết nối lỗi, `data` về null, `notifications`
// âm thầm thành [] và badge thành 0, không có dấu hiệu gì cho người dùng
// biết chuông đang lỗi hay chỉ đơn giản không có thông báo nào. Giờ bắt
// error và hiện ra actionError (đã có sẵn cơ chế hiện lỗi trong panel) để
// lần sau còn biết chính xác đang kẹt ở đâu, thay vì chỉ thấy "im lặng".
describe("NotificationBell — không còn nuốt lỗi âm thầm khi tải thông báo thất bại", () => {
  const source = read("src/components/notification-bell.tsx");

  it("bắt error của cả truy vấn danh sách và truy vấn đếm chưa đọc", () => {
    expect(source).toContain("const [{ data, error: listError }, { count: unreadCount, error: countError }] = await Promise.all([");
  });

  it("hiện lỗi qua actionError (cơ chế hiện lỗi đã có sẵn trong panel) và dừng trước khi set rows/unreadTotal sai", () => {
    expect(source).toContain("if (listError || countError) {");
    expect(source).toContain('setActionError(`Không tải được thông báo: ${listError?.message || countError?.message}`);');
    expect(source).toMatch(/if \(listError \|\| countError\) \{\s*setActionError\(`Không tải được thông báo: \$\{listError\?\.message \|\| countError\?\.message\}`\);\s*return;\s*\}/);
  });
});
