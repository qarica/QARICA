// Kho hóa chất & VTYT khoa Xét nghiệm — hằng số + hàm thuần dùng chung cho
// API, trang và test. KHÔNG import "@/..." ở file này (Vitest của repo không
// resolve alias) để test import trực tiếp được.

export type SupplyCategory = "REAGENT" | "CONSUMABLE" | "CONTROL_CALIBRATOR" | "OTHER";
export type MovementType = "RECEIPT" | "ISSUE" | "DISPOSAL" | "ADJUST";
export type DisposalReason = "EXPIRED" | "DAMAGED" | "CONTAMINATED" | "OTHER";
export type AdjustReason = "STOCKTAKE" | "SHRINKAGE" | "CORRECTION";

export const CATEGORY_LABEL: Record<SupplyCategory, string> = {
  REAGENT: "Hóa chất / thuốc thử",
  CONSUMABLE: "Vật tư tiêu hao",
  CONTROL_CALIBRATOR: "Chất chuẩn / chất kiểm soát",
  OTHER: "Khác",
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  RECEIPT: "Nhập kho",
  ISSUE: "Xuất dùng",
  DISPOSAL: "Hủy hàng",
  ADJUST: "Điều chỉnh",
};

export const DISPOSAL_REASON_LABEL: Record<DisposalReason, string> = {
  EXPIRED: "Hết hạn dùng",
  DAMAGED: "Hư hỏng / vỡ",
  CONTAMINATED: "Nhiễm bẩn",
  OTHER: "Lý do khác",
};

export const ADJUST_REASON_LABEL: Record<AdjustReason, string> = {
  STOCKTAKE: "Kiểm kê",
  SHRINKAGE: "Hao hụt",
  CORRECTION: "Sửa sai sổ",
};

export const REASON_LABEL: Record<string, string> = { ...DISPOSAL_REASON_LABEL, ...ADJUST_REASON_LABEL };

// Hóa chất, chất chuẩn/kiểm soát bắt buộc có hạn dùng khi nhập kho (trùng
// ràng buộc trong hàm RPC qlcl_lab_supply_receive_v1).
export const EXPIRY_REQUIRED_CATEGORIES: SupplyCategory[] = ["REAGENT", "CONTROL_CALIBRATOR"];

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as SupplyCategory[];

export type LotExpiryStatus = "NO_EXPIRY" | "EXPIRED" | "EXPIRING" | "OK";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyToUtc(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD), khớp hàm SQL (Asia/Ho_Chi_Minh). */
export function todayInVietnam(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Số ngày còn lại tới hạn dùng (âm = đã quá hạn); null nếu lô không có hạn. */
export function daysUntilExpiry(expiryDate: string | null, today: string): number | null {
  if (!expiryDate) return null;
  return Math.round((dateOnlyToUtc(expiryDate) - dateOnlyToUtc(today)) / DAY_MS);
}

/**
 * Trạng thái hạn dùng của lô. Hết hạn khi hạn dùng < hôm nay (còn đúng ngày hạn
 * vẫn dùng được — khớp kiểm tra "expiry_date < movement_date" của hàm xuất kho).
 * Sắp hết hạn khi còn <= warningDays ngày (cấu hình theo vật tư).
 */
export function lotExpiryStatus(expiryDate: string | null, warningDays: number, today: string): LotExpiryStatus {
  const days = daysUntilExpiry(expiryDate, today);
  if (days === null) return "NO_EXPIRY";
  if (days < 0) return "EXPIRED";
  if (days <= warningDays) return "EXPIRING";
  return "OK";
}

export type ItemStockStatus = "OUT" | "LOW" | "OK";

/** Hết hàng khi tồn <= 0; sắp hết khi có định mức tối thiểu > 0 và tồn <= định mức. */
export function itemStockStatus(totalBalance: number, minStock: number): ItemStockStatus {
  if (totalBalance <= 0) return "OUT";
  if (minStock > 0 && totalBalance <= minStock) return "LOW";
  return "OK";
}

type LotLike = { expiry_date: string | null; lot_number: string };

/** FEFO: lô hết hạn sớm nhất xuất trước; lô không có hạn xếp sau cùng. */
export function sortLotsFefo<T extends LotLike>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiry_date && b.expiry_date) {
      const byDate = a.expiry_date.localeCompare(b.expiry_date);
      if (byDate !== 0) return byDate;
    } else if (a.expiry_date) return -1;
    else if (b.expiry_date) return 1;
    return a.lot_number.localeCompare(b.lot_number);
  });
}

/** Số lượng dương hợp lệ (tối đa 3 chữ số thập phân) hoặc null. */
export function parsePositiveQuantity(value: unknown): number | null {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw || !/^\d+(\.\d{1,3})?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Số có dấu bất kỳ khác 0 (dùng cho điều chỉnh), tối đa 3 chữ số thập phân. */
export function parseSignedQuantity(value: unknown): number | null {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw || !/^-?\d+(\.\d{1,3})?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Quy đổi số lượng người dùng nhập thành delta có dấu trong sổ. */
export function signedDelta(type: MovementType, quantity: number): number {
  if (type === "RECEIPT") return Math.abs(quantity);
  if (type === "ISSUE" || type === "DISPOSAL") return -Math.abs(quantity);
  return quantity; // ADJUST: giữ nguyên dấu người dùng chọn
}

export function formatQuantity(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(n);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
