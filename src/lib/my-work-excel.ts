// Xuất Excel "Việc của tôi" — cùng mẫu HTML-table-as-.xls đã dùng ở các route export khác
// (api/procedure-trainings/[id]/export/excel, api/plans/[id]/export/excel). Dữ liệu là ĐÚNG danh sách
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

export function escapeExcelHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}

export function buildMyWorkExcelHtml(rows: MyWorkExportRow[], caption: string): string {
  const body = rows
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td>${escapeExcelHtml(r.title)}</td><td>${escapeExcelHtml(r.type)}</td><td>${escapeExcelHtml(r.relatedTo)}</td><td>${escapeExcelHtml(r.createdAt)}</td><td>${escapeExcelHtml(r.priority)}</td><td>${escapeExcelHtml(r.dueDate)}</td><td>${escapeExcelHtml(r.completedAt)}</td><td>${escapeExcelHtml(r.status)}</td><td>${escapeExcelHtml(r.note)}</td></tr>`,
    )
    .join("");
  const head = MY_WORK_EXCEL_HEADERS.map((h) => `<th>${h}</th>`).join("");
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #777;padding:5px;vertical-align:top;white-space:pre-wrap}th{background:#e5e7eb;font-weight:bold}caption{font-weight:bold;text-align:left;padding:4px 0}
    </style></head><body>
      <table>
        <caption>${escapeExcelHtml(caption)}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${MY_WORK_EXCEL_HEADERS.length}">Không có việc phù hợp.</td></tr>`}</tbody>
      </table>
    </body></html>`;
}

// Tên file an toàn (chỉ ASCII), vd "viec-cua-toi_2026-11-26.xls"; có thêm hậu tố tuần nếu đang lọc tuần.
export function myWorkExcelFileName(todayKey: string, weekStart?: string | null): string {
  const safe = (s: string) => s.replace(/[^0-9A-Za-z-]+/g, "");
  return `viec-cua-toi_${weekStart ? `tuan-${safe(weekStart)}` : safe(todayKey)}.xls`;
}
