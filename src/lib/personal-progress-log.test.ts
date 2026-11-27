import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProgressLog } from "./personal-progress-log";

describe("parseProgressLog — nhật ký tiến độ việc cá nhân", () => {
  const note = "[14:15 27/11/2026 · Tiến độ 90%]\n23/11: Đã áp cổng\n23/11: Đã gửi email\n\n[14:16 27/11/2026 · Tiến độ 90%]\n27/11: Đã làm xong công văn";
  it("tách đúng từng lần cập nhật (định dạng giờ đứng trước ngày), MỚI NHẤT Ở TRÊN", () => {
    const { entries } = parseProgressLog(note);
    expect(entries).toHaveLength(2);
    expect(entries[0].stamp).toBe("14:16 27/11/2026");
    expect(entries[0].body).toBe("27/11: Đã làm xong công văn");
    expect(entries[1].stamp).toBe("14:15 27/11/2026");
    expect(entries[1].body).toBe("23/11: Đã áp cổng\n23/11: Đã gửi email");
    expect(entries[0].percent).toBe(90);
  });
  it("vẫn nhận dạng định dạng cũ (ngày đứng trước giờ)", () => {
    const { entries } = parseProgressLog("[27/11/2026 14:15 · Tiến độ 40%]\nA\n\n[28/11/2026 09:00 · Tiến độ 60%]\nB");
    expect(entries.map((e) => e.percent)).toEqual([60, 40]);
  });
  it("tách dòng ghi chú chuyển/giao việc ở đầu ô, không lẫn vào nội dung tiến độ", () => {
    const r = parseProgressLog("[Chuyển từ Nguyễn A ngày 27/11/2026 — đi công tác]\n[14:15 27/11/2026 · Tiến độ 30%]\nLàm rồi");
    expect(r.notices).toEqual(["Chuyển từ Nguyễn A ngày 27/11/2026 — đi công tác"]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].body).toBe("Làm rồi");
  });
  it("ghi chú thường không có tiêu đề tiến độ vẫn hiển thị (1 mục, không % )", () => {
    const r = parseProgressLog("Ghi chú tự do");
    expect(r.entries).toEqual([{ stamp: "", percent: null, body: "Ghi chú tự do" }]);
    expect(parseProgressLog(null).entries).toEqual([]);
  });
});

describe("hộp Nhật ký tiến độ gọn: mới nhất ở trên, không lặp lại nhật ký trong Lịch sử", () => {
  it("dùng bộ tách chung và gập phần gia hạn/lịch sử", () => {
    const c = readFileSync("src/components/personal-task-progress-title.tsx", "utf8");
    expect(c).toContain("parseProgressLog(note)");
    expect(c).toContain("Mới nhất");
    expect(c).toContain("<details");
    const h = readFileSync("src/components/personal-task-audit-history.tsx", "utf8");
    expect(h).toContain('e.event_type!=="PROGRESS"');
  });
});
