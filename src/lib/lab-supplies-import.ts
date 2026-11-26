// Nhập danh mục vật tư từ Excel/CSV cho Kho hóa chất & VTYT XN. Hàm thuần (không import "@/...") để kiểm thử.
// Cột nhận theo TÊN tiêu đề (không phân biệt hoa/thường/dấu), không cố định thứ tự — vì file do người dùng tự soạn.
import { CATEGORY_LABEL, type SupplyCategory } from "./lab-supplies";

export const MAX_IMPORT_ROWS = 2000;

export type ImportField = "code" | "name" | "category" | "unit" | "manufacturer" | "barcode" | "min_stock" | "expiry_warning_days" | "storage_condition" | "notes";

export const IMPORT_TEMPLATE_HEADERS: { field: ImportField; label: string; required?: boolean }[] = [
  { field: "code", label: "Mã vật tư", required: true },
  { field: "name", label: "Tên vật tư", required: true },
  { field: "category", label: "Nhóm" },
  { field: "unit", label: "Đơn vị tính", required: true },
  { field: "manufacturer", label: "Hãng sản xuất" },
  { field: "barcode", label: "Mã vạch" },
  { field: "min_stock", label: "Định mức tối thiểu" },
  { field: "expiry_warning_days", label: "Báo hết hạn trước (ngày)" },
  { field: "storage_condition", label: "Điều kiện bảo quản" },
  { field: "notes", label: "Ghi chú" },
];

export function foldHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIASES: Record<ImportField, string[]> = {
  code: ["ma vat tu", "ma vt", "ma", "code", "ma hang", "ma hoa chat"],
  name: ["ten vat tu", "ten hoa chat", "ten vt", "ten", "name", "ten hang"],
  category: ["nhom", "nhom vat tu", "loai", "loai vat tu", "category"],
  unit: ["don vi tinh", "dvt", "don vi", "unit"],
  manufacturer: ["hang san xuat", "hang sx", "nha san xuat", "hang", "manufacturer"],
  barcode: ["ma vach", "ma vach ma qr", "barcode", "ma qr", "ma vach qr"],
  min_stock: ["dinh muc toi thieu", "dinh muc", "ton toi thieu", "ton kho toi thieu", "min"],
  expiry_warning_days: ["bao het han truoc ngay", "bao het han truoc", "so ngay canh bao", "canh bao het han", "bao truoc het han ngay"],
  storage_condition: ["dieu kien bao quan", "bao quan"],
  notes: ["ghi chu", "note", "notes"],
};

const CATEGORY_SYNONYMS: [SupplyCategory, string[]][] = [
  ["REAGENT", ["reagent", "hoa chat", "thuoc thu", "hoa chat thuoc thu", "hoa chat thuoc thu"]],
  ["CONSUMABLE", ["consumable", "vat tu tieu hao", "tieu hao", "vtth", "vat tu"]],
  ["CONTROL_CALIBRATOR", ["control calibrator", "chat chuan", "chat kiem soat", "chat chuan chat kiem soat", "control", "calibrator"]],
  ["OTHER", ["other", "khac"]],
];

export function parseCategory(raw: unknown): SupplyCategory | null {
  const folded = foldHeader(raw);
  if (!folded) return "REAGENT";
  for (const [key, label] of Object.entries(CATEGORY_LABEL) as [SupplyCategory, string][]) {
    if (folded === foldHeader(label)) return key;
  }
  for (const [key, names] of CATEGORY_SYNONYMS) if (names.some((n) => foldHeader(n) === folded)) return key;
  return null;
}

export type ColumnMap = Partial<Record<ImportField, number>>;

/** Tìm dòng tiêu đề trong 10 dòng đầu (file có thể có tiêu đề báo cáo phía trên). */
export function detectColumns(rows: unknown[][]): { headerRow: number; columns: ColumnMap } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const folded = (rows[r] || []).map(foldHeader);
    const columns: ColumnMap = {};
    for (const field of Object.keys(ALIASES) as ImportField[]) {
      const idx = folded.findIndex((h) => h && ALIASES[field].includes(h));
      if (idx >= 0) columns[field] = idx;
    }
    if (columns.code !== undefined && columns.name !== undefined && columns.unit !== undefined) return { headerRow: r, columns };
  }
  return null;
}

export type ParsedItem = {
  code: string;
  name: string;
  category: SupplyCategory;
  unit: string;
  manufacturer: string | null;
  barcode: string | null;
  min_stock: number;
  expiry_warning_days: number;
  storage_condition: string | null;
  notes: string | null;
};
export type ImportRowResult = { rowNumber: number; code: string; name: string; item: ParsedItem | null; errors: string[] };

const cell = (row: unknown[], idx: number | undefined) => (idx === undefined ? "" : String(row[idx] ?? "").trim());

function parseNonNegative(raw: string, label: string, errors: string[], fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} phải là số không âm`);
    return fallback;
  }
  return n;
}

export function parseItemRows(rows: unknown[][], existingCodes: Set<string>, existingBarcodes: Set<string>): { results: ImportRowResult[]; missing: string[] } {
  const detected = detectColumns(rows);
  if (!detected) return { results: [], missing: IMPORT_TEMPLATE_HEADERS.filter((h) => h.required).map((h) => h.label) };
  const { headerRow, columns } = detected;
  const seenCodes = new Set<string>();
  const seenBarcodes = new Set<string>();
  const results: ImportRowResult[] = [];

  for (let i = headerRow + 1; i < rows.length && results.length < MAX_IMPORT_ROWS; i++) {
    const row = rows[i] || [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const errors: string[] = [];
    const code = cell(row, columns.code).toUpperCase();
    const name = cell(row, columns.name);
    const unit = cell(row, columns.unit);
    if (!code) errors.push("Thiếu mã vật tư");
    else if (code.length > 40) errors.push("Mã vật tư tối đa 40 ký tự");
    if (!name) errors.push("Thiếu tên vật tư");
    else if (name.length > 300) errors.push("Tên vật tư tối đa 300 ký tự");
    if (!unit) errors.push("Thiếu đơn vị tính");
    else if (unit.length > 40) errors.push("Đơn vị tính tối đa 40 ký tự");
    const category = parseCategory(cell(row, columns.category));
    if (!category) errors.push(`Nhóm “${cell(row, columns.category)}” không hợp lệ (Hóa chất / Vật tư tiêu hao / Chất chuẩn / Khác)`);
    const min = parseNonNegative(cell(row, columns.min_stock), "Định mức tối thiểu", errors, 0);
    const warnRaw = parseNonNegative(cell(row, columns.expiry_warning_days), "Số ngày báo hết hạn", errors, 30);
    if (!Number.isInteger(warnRaw) || warnRaw > 3650) errors.push("Số ngày báo hết hạn phải là số nguyên từ 0 đến 3650");
    const barcode = cell(row, columns.barcode);
    if (barcode.length > 64) errors.push("Mã vạch tối đa 64 ký tự");
    const codeKey = code.toLowerCase();
    if (code) {
      if (existingCodes.has(codeKey)) errors.push("Mã vật tư đã có trong kho");
      if (seenCodes.has(codeKey)) errors.push("Mã vật tư bị lặp trong file");
      seenCodes.add(codeKey);
    }
    const barKey = barcode.toLowerCase();
    if (barcode) {
      if (existingBarcodes.has(barKey)) errors.push("Mã vạch đã gắn cho vật tư khác");
      if (seenBarcodes.has(barKey)) errors.push("Mã vạch bị lặp trong file");
      seenBarcodes.add(barKey);
    }
    results.push({
      rowNumber: i + 1,
      code,
      name,
      errors,
      item: errors.length
        ? null
        : {
            code,
            name,
            category: category as SupplyCategory,
            unit,
            manufacturer: cell(row, columns.manufacturer) || null,
            barcode: barcode || null,
            min_stock: min,
            expiry_warning_days: warnRaw,
            storage_condition: cell(row, columns.storage_condition) || null,
            notes: cell(row, columns.notes) || null,
          },
    });
  }
  return { results, missing: [] };
}
