import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Mức 1 của đề xuất "đưa ý tưởng Javis OS vào QARICA" (báo qua Zalo OA bên
// cạnh chuông in-app). Thêm kênh gửi mới, KHÔNG đổi logic tính "ai cần báo
// gì" đã có trong notification-sync.ts — chỉ thêm 1 bước sau khi notifications
// đã insert thành công.
describe("Mức 1 Javis OS — kênh báo Zalo OA cho thông báo mức cao", () => {
  const zaloLib = read("src/lib/zalo-oa.ts");
  const sync = read("src/lib/notification-sync.ts");
  const meRoute = read("src/app/api/me/zalo/route.ts");

  it("sendZaloOaText no-op có log khi thiếu ZALO_OA_ACCESS_TOKEN, không throw", () => {
    expect(zaloLib).toContain('const token = process.env.ZALO_OA_ACCESS_TOKEN;');
    expect(zaloLib).toContain('if (!token) return { ok: false, skipped: true,');
  });

  it("notification-sync.ts chỉ push Zalo cho hàng VỪA insert mới (không gửi lại hàng trùng notification_event_key của lần poll trước)", () => {
    // Mọi .upsert(...).select(...) chỉ lấy thêm priority (KHÔNG lấy title/
    // message) — pushHighPriorityToZalo không được phép chạm vào nội dung
    // thông báo thật, chỉ lọc theo mức ưu tiên.
    expect(sync).toContain('.select("id,priority")');
    // Đúng 7 điểm insert notifications trong file đều gọi hàm push — khớp
    // với 7 nguồn (action/emr/monitoring awaiting/monitoring recheck/
    // quality attention/physician license/personal reminder).
    const calls = sync.match(/await pushHighPriorityToZalo\(admin, userId, inserted\);/g) || [];
    expect(calls.length).toBe(7);
  });

  it("pushHighPriorityToZalo chỉ gửi cho priority HIGH/URGENT/CRITICAL và bỏ qua khi user chưa liên kết Zalo", () => {
    expect(sync).toContain('const ZALO_PUSH_PRIORITIES = new Set(["HIGH", "URGENT", "CRITICAL"]);');
    expect(sync).toContain("if (!zaloUserId) return;");
  });

  it("nội dung gửi qua Zalo KHÔNG mang nguyên văn title/message của notification — chỉ báo số lượng theo mức ưu tiên, không nêu nội dung cụ thể (tránh lộ dữ liệu nhạy cảm qua lịch sử chat Zalo/preview màn hình khóa)", () => {
    expect(sync).toContain("insertedRows: { priority?: string | null }[] | null | undefined,");
    expect(sync).not.toMatch(/sendZaloOaText\([^)]*\brow\.title\b/);
    expect(sync).not.toMatch(/sendZaloOaText\([^)]*\brow\.message\b/);
    expect(sync).toContain('await sendZaloOaText(zaloUserId, `QARICA: ${parts.join(", ")} cần xử lý. Mở app QARICA để xem chi tiết.`);');
  });

  it("/api/me/zalo chỉ cho sửa đúng hàng profiles của chính người gọi (auth.uid()), không nhận user_id từ body", () => {
    expect(meRoute).toContain('.eq("user_id", user.id)');
    expect(meRoute).not.toContain("body.user_id");
  });
});
