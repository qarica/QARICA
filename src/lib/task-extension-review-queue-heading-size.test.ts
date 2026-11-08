import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "Chữ đề nghị gia hạn nhỏ lại đang quá to" — nút thu gọn/
// mở rộng "Đề nghị gia hạn cần phê duyệt ▸" trên trang Việc của tôi
// (TaskExtensionReviewQueue, render ngay cạnh PersonalReminders) có
// fontSize:18 trong khi tiêu đề thu gọn tương tự khác trên cùng trang
// ("Cần tôi xử lý / xác minh" — <summary> dùng .tqm-my-work summary{font-
// size:12px}) nhỏ hơn hẳn, khiến dòng này nổi bật to bất thường so với các
// mục cùng cấp. Giảm xuống 13px — gần với quy ước 12px của summary lân cận.
describe("TaskExtensionReviewQueue: tiêu đề thu gọn không còn to bất thường so với các mục cùng cấp trên /tasks", () => {
  it("nút 'Đề nghị gia hạn cần phê duyệt' còn fontSize:13 (trước là 18), vẫn giữ fontWeight:700", () => {
    const client = read("src/components/task-extension-review-queue.tsx");
    expect(client).toContain('style={{background:"none",border:0,textAlign:"left",fontSize:13,fontWeight:700,cursor:"pointer"}}');
    expect(client).not.toContain("fontSize:18");
  });
});
