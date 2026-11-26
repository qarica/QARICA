// Ghi bảng ra file .xlsx THẬT (Office Open XML) bằng write-excel-file — chỉ chạy phía máy chủ (Node).
// Dòng 1 = tiêu đề (đậm, gộp ô), dòng 2 = tên cột (đậm, nền xám, cố định khi cuộn), từ dòng 3 = dữ liệu;
// số là ô SỐ, chữ là ô chữ. Mỗi SheetSpec là một trang tính.
import writeXlsxFile from "write-excel-file/node";
import type { SheetSpec } from "./lab-supplies-export";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function sheetsToXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const book = sheets.map((sh) => {
    const cols = sh.headers.length;
    const body = sh.rows.length
      ? sh.rows.map((r) => r.map((c) => (typeof c === "number" && Number.isFinite(c) ? { value: c, type: Number } : { value: String(c ?? "") })))
      : [[{ value: sh.emptyText, columnSpan: cols }]];
    return {
      sheet: sh.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"),
      data: [
        [{ value: sh.title, fontWeight: "bold" as const, columnSpan: cols }],
        sh.headers.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#E5E7EB", wrap: true })),
        ...body,
      ],
      columns: (sh.widths || sh.headers.map(() => 16)).map((width) => ({ width })),
      stickyRowsCount: 2,
    };
  });
  return writeXlsxFile(book).toBuffer();
}

/** Tên file ASCII an toàn cho Content-Disposition. */
export const xlsxFileName = (base: string) => `${base.replace(/[^A-Za-z0-9._-]+/g, "_")}.xlsx`;
