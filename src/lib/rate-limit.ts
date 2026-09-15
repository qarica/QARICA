// Bộ giới hạn tần suất đơn giản, lưu trong bộ nhớ (in-memory).
//
// Giới hạn thật: Vercel chạy nhiều serverless instance song song, mỗi
// instance có bộ nhớ riêng, nên đây KHÔNG phải giới hạn tuyệt đối trên
// toàn hệ thống — một kẻ tấn công dùng nhiều IP/nhiều request đồng thời
// có thể né được một phần. Đây là lớp bảo vệ đầu tiên, rẻ và không cần
// thêm dịch vụ nào (Redis/Upstash), chặn được kiểu dò mật khẩu tuần tự
// đơn giản — vốn là kiểu tấn công phổ biến nhất.
//
// Nếu sau này muốn chặn triệt để hơn, nên bật thêm giới hạn tần suất có
// sẵn của Supabase Auth: Dashboard > Authentication > Rate Limits.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Dọn bộ nhớ định kỳ để không phình to vô hạn.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupIfNeeded(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Giới hạn số lần gọi cho một khóa (thường là IP, hoặc IP+tài khoản).
 * @param key khóa định danh (ví dụ: `login:${ip}:${username}`)
 * @param limit số lần cho phép trong 1 cửa sổ thời gian
 * @param windowMs độ dài cửa sổ thời gian, tính bằng mili-giây
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanupIfNeeded(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Lấy IP thật của người gọi trên môi trường Vercel/edge proxy. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
