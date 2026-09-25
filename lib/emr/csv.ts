// Trình phân tích CSV tối giản, không phụ thuộc thư viện ngoài — đủ dùng cho
// việc nhập dữ liệu EMR từ file Excel đã xuất ra CSV (xem scripts/export_excel_to_csv.py).
// Hỗ trợ dấu phẩy phân cách, giá trị có ngoặc kép, và xuống dòng trong ô.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Chuẩn hoá line ending và bỏ BOM nếu Excel thêm vào đầu file.
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  const [headers, ...dataRows] = nonEmpty;
  return { headers: (headers ?? []).map((h) => h.trim()), rows: dataRows };
}

/** Chuyển các dòng đã parse thành mảng object theo header, bỏ qua cột thừa. */
export function csvToRecords(parsed: ParsedCsv): Record<string, string>[] {
  return parsed.rows.map((r) => {
    const rec: Record<string, string> = {};
    parsed.headers.forEach((h, idx) => {
      rec[h] = (r[idx] ?? "").trim();
    });
    return rec;
  });
}

export function toBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "x" || s === "true" || s === "1" || s === "có" || s === "yes";
}

export function toIntOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
