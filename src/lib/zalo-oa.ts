// Mức 1 của đề xuất "đưa ý tưởng Javis OS vào QARICA" (báo qua Zalo OA thay/
// kèm chuông in-app) — tái dùng logic tính "ai cần báo gì" đã có trong
// notification-sync.ts, chỉ thêm 1 kênh gửi. Không đổi gì ở logic tính toán
// thông báo hiện có.
//
// Cần ZALO_OA_ACCESS_TOKEN (Access token của Zalo Official Account, lấy ở
// Zalo for Developers — OA của chính bệnh viện/đơn vị vận hành QARICA, không
// phải của người dùng). Thiếu env var → no-op có log, không throw, không
// chặn luồng tạo thông báo in-app vẫn đang hoạt động.
//
// Giới hạn thật của Zalo OA (không phải lỗi QARICA): API "tin tư vấn"
// (message/cs) chỉ gửi được cho user đã từng tương tác với OA trong 7 ngày
// gần nhất. Quá 7 ngày, Zalo trả lỗi — hàm này coi đó là thất bại bình
// thường (ok:false), không retry, không throw.
const ZALO_SEND_URL = "https://openapi.zalo.me/v3.0/oa/message/cs";

export function isZaloOaConfigured(): boolean {
  return !!process.env.ZALO_OA_ACCESS_TOKEN;
}

export async function sendZaloOaText(zaloUserId: string, text: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env.ZALO_OA_ACCESS_TOKEN;
  if (!token) return { ok: false, skipped: true, error: "ZALO_OA_ACCESS_TOKEN chưa cấu hình." };
  const cleanUserId = String(zaloUserId || "").trim();
  if (!cleanUserId) return { ok: false, error: "Thiếu zalo_user_id." };

  try {
    const response = await fetch(ZALO_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: token },
      body: JSON.stringify({ recipient: { user_id: cleanUserId }, message: { text } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) {
      return { ok: false, error: typeof result?.message === "string" ? result.message : `Zalo OA trả lỗi (HTTP ${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không gửi được tới Zalo OA." };
  }
}
