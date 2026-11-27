// Đọc đủ MỌI dòng của một truy vấn Supabase/PostgREST. Máy chủ cắt âm thầm ở 1.000 dòng/yêu cầu (max-rows), bất kể .limit() lớn hơn;
// nếu không phân trang, màn hình/Excel sẽ thiếu dòng mà không báo lỗi (tồn kho sai). Hàm thuần, không import "@/..." để kiểm thử.

export const PAGE_SIZE = 1000;

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * `fetchPage(from, to)` phải trả đúng khoảng dòng [from, to] của một truy vấn có ORDER BY ổn định
 * (thêm khóa duy nhất làm tiêu chí cuối để các trang không trùng/sót dòng). Dừng khi trang ngắn hơn PAGE_SIZE hoặc đạt maxRows.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = 200_000,
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const res = await fetchPage(from, from + PAGE_SIZE - 1);
    if (res.error) return { data: all, error: res.error, truncated: false };
    const rows = res.data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: all, error: null, truncated: false };
    from += PAGE_SIZE;
    if (all.length >= maxRows) return { data: all.slice(0, maxRows), error: null, truncated: true };
  }
}
