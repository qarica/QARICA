// Xuất Excel "Việc của tôi" — file .xlsx THẬT (Office Open XML), dựng ngay trên trình duyệt bằng write-excel-file.
// Dữ liệu là ĐÚNG danh sách
// trang /tasks đang hiển thị (đã áp dụng tab + tìm kiếm + lọc tuần, KHÔNG cắt theo trang 10 dòng):
// trang server dựng 1 lần rồi truyền xuống, không viết lại truy vấn/gộp nguồn ở chỗ khác
// (CLAUDE.md nguyên tắc 2: một nghiệp vụ chỉ một nguồn sự thật).
// Chỉ dùng import tương đối/không import để vitest (không có alias "@/") kiểm thử được.

export type MyWorkExportRow = {
  title: string;
  type: string;
  relatedTo: string;
  createdAt: string; // đã định dạng dd/MM/yyyy hoặc "—"
  priority: string;
  dueDate: string;
  completedAt: string;
  status: string;
  note: string;
};

export const MY_WORK_EXCEL_HEADERS = ["STT", "Tiêu đề công việc", "Loại", "Liên quan đến", "Ngày giao việc", "Ưu tiên", "Hạn xử lý", "Ngày hoàn thành", "Trạng thái", "Ghi chú / theo dõi"] as const;

/** Một trang tính: dòng 1 = tiêu đề (đậm, gộp ô), dòng 2 = tên cột (đậm, nền xám), từ dòng 3 = dữ liệu (STT là ô số). */
export function buildMyWorkSheet(rows: MyWorkExportRow[], caption: string) {
  const cols = MY_WORK_EXCEL_HEADERS.length;
  const body = rows.length
    ? rows.map((r, i) => [
        { value: i + 1, type: Number },
        { value: r.title, wrap: true },
        { value: r.type, wrap: true },
        { value: r.relatedTo, wrap: true },
        { value: r.createdAt },
        { value: r.priority },
        { value: r.dueDate },
        { value: r.completedAt },
        { value: r.status },
        { value: r.note, wrap: true },
      ])
    : [[{ value: "Không có việc phù hợp.", columnSpan: cols }]];
  return {
    sheet: "Việc của tôi",
    data: [
      [{ value: caption, fontWeight: "bold" as const, columnSpan: cols }],
      MY_WORK_EXCEL_HEADERS.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#E5E7EB", wrap: true })),
      ...body,
    ],
    columns: [6, 42, 24, 36, 14, 12, 14, 16, 18, 44].map((width) => ({ width })),
    stickyRowsCount: 2,
  };
}

// Tên file an toàn (chỉ ASCII), vd "viec-cua-toi_2026-11-26.xlsx"; có thêm hậu tố tuần nếu đang lọc tuần.
export function myWorkExcelFileName(todayKey: string, weekStart?: string | null): string {
  const safe = (s: string) => s.replace(/[^0-9A-Za-z-]+/g, "");
  return `viec-cua-toi_${weekStart ? `tuan-${safe(weekStart)}` : safe(todayKey)}.xlsx`;
}
