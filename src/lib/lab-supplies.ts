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

// ---------------------------------------------------------------------------
// Quét mã vạch / QR để tra cứu vật tư + bảng Kanban bổ sung (chỉ để xem, không kéo-thả làm đổi số liệu:
// sổ xuất nhập là bất biến, tồn luôn là tổng sổ).
// ---------------------------------------------------------------------------

/** Chuẩn hóa chuỗi quét được: bỏ ký tự điều khiển/xuống dòng (máy quét USB gõ kèm Enter) và khoảng trắng 2 đầu. */
export function normalizeScanCode(raw: unknown): string {
  return String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

type ScanItemLike = { id: string; code: string; barcode?: string | null };

/**
 * Tìm vật tư theo mã quét: ưu tiên mã vạch (barcode), sau đó mã quản lý (code); không phân biệt hoa/thường.
 * Mã vạch là duy nhất trong tổ chức (chỉ mục duy nhất) nên kết quả không mơ hồ.
 */
export function findItemByScan<T extends ScanItemLike>(items: T[], raw: unknown): T | null {
  const code = normalizeScanCode(raw).toLowerCase();
  if (!code) return null;
  return items.find((i) => (i.barcode || "").trim().toLowerCase() === code) ?? items.find((i) => i.code.trim().toLowerCase() === code) ?? null;
}

export type KanbanColumnKey = "OUT" | "EXPIRED" | "LOW" | "EXPIRING" | "OK";

export const KANBAN_COLUMNS: { key: KanbanColumnKey; label: string; hint: string; tone: "danger" | "warning" | "info" | "success" }[] = [
  { key: "OUT", label: "Hết hàng", hint: "Tồn = 0 — cần đặt hàng", tone: "danger" },
  { key: "EXPIRED", label: "Có lô hết hạn", hint: "Còn tồn lô đã quá hạn — lập phiếu hủy", tone: "danger" },
  { key: "LOW", label: "Dưới định mức", hint: "Tồn ≤ định mức tối thiểu — nên bổ sung", tone: "warning" },
  { key: "EXPIRING", label: "Lô sắp hết hạn", hint: "Ưu tiên xuất trước (FEFO)", tone: "info" },
  { key: "OK", label: "Đủ hàng", hint: "Tồn trên định mức, hạn dùng ổn", tone: "success" },
];

/** Mỗi vật tư nằm đúng 1 cột theo mức khẩn: hết hàng > có lô hết hạn > dưới định mức > lô sắp hết hạn > đủ. */
export function kanbanColumnFor(stock: ItemStockStatus, expiredLots: number, expiringLots: number): KanbanColumnKey {
  if (stock === "OUT") return "OUT";
  if (expiredLots > 0) return "EXPIRED";
  if (stock === "LOW") return "LOW";
  if (expiringLots > 0) return "EXPIRING";
  return "OK";
}

// ---------------------------------------------------------------------------
// Xuất kho thông minh: người dùng chỉ chọn vật tư + số lượng, hệ thống tự phân bổ qua các lô theo FEFO
// (hạn dùng gần nhất trước). Hàm thuần — dùng cả cho xem trước trên giao diện lẫn kiểm thử.
// ---------------------------------------------------------------------------
export type AllocLot = { lot_id: string; lot_number: string; expiry_date: string | null; balance: number };
export type Allocation = { lot_id: string; lot_number: string; expiry_date: string | null; quantity: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Phân bổ `quantity` qua các lô của MỘT vật tư.
 * - ISSUE (xuất dùng): bỏ lô đã hết hạn (không được xuất dùng), lô hết hạn sớm nhất trước.
 * - DISPOSAL (hủy hàng): lô đã hết hạn trước (đúng nhu cầu hủy hàng hết hạn), rồi tới FEFO.
 * `used` = số đã phân bổ ở các dòng trước cùng phiếu (để 2 dòng cùng vật tư không dùng trùng một lượng tồn).
 */
export function allocateFefo(lots: AllocLot[], quantity: number, mode: "ISSUE" | "DISPOSAL", today: string, used: Record<string, number> = {}): { allocations: Allocation[]; shortage: number } {
  const ordered = sortLotsFefo(lots.filter((l) => l.balance > 0));
  const isExpired = (l: AllocLot) => daysUntilExpiry(l.expiry_date, today) !== null && (daysUntilExpiry(l.expiry_date, today) as number) < 0;
  const candidates = mode === "ISSUE" ? ordered.filter((l) => !isExpired(l)) : [...ordered.filter(isExpired), ...ordered.filter((l) => !isExpired(l))];
  let remaining = round3(quantity);
  const allocations: Allocation[] = [];
  for (const lot of candidates) {
    if (remaining <= 0) break;
    const available = round3(lot.balance - (used[lot.lot_id] ?? 0));
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    allocations.push({ lot_id: lot.lot_id, lot_number: lot.lot_number, expiry_date: lot.expiry_date, quantity: round3(take) });
    remaining = round3(remaining - take);
  }
  return { allocations, shortage: Math.max(0, remaining) };
}

/** Đề nghị đặt hàng: đưa tồn lên 2× định mức tối thiểu (chỉ khi có định mức); 0 nghĩa là không đề xuất được. */
export function suggestedOrderQuantity(total: number, minStock: number): number {
  if (!(minStock > 0) || total > minStock) return 0;
  return Math.max(0, round3(minStock * 2 - total));
}


/** Thứ tự xếp mặc định của bảng Tồn kho: việc cần xử lý trước (hết hạn → hết hàng → dưới định mức → sắp hết hạn → đủ). */
const URGENCY_ORDER: KanbanColumnKey[] = ["EXPIRED", "OUT", "LOW", "EXPIRING", "OK"];
export function compareStockUrgency(
  a: { item: { code: string }; column: KanbanColumnKey; nextExpiry: string | null },
  b: { item: { code: string }; column: KanbanColumnKey; nextExpiry: string | null },
): number {
  const byColumn = URGENCY_ORDER.indexOf(a.column) - URGENCY_ORDER.indexOf(b.column);
  if (byColumn !== 0) return byColumn;
  // Cùng mức: lô hết hạn sớm nhất lên trên; vật tư không có hạn dùng xuống cuối.
  if (a.nextExpiry !== b.nextExpiry) {
    if (!a.nextExpiry) return 1;
    if (!b.nextExpiry) return -1;
    return a.nextExpiry < b.nextExpiry ? -1 : 1;
  }
  return a.item.code.localeCompare(b.item.code, "vi");
}

/** Chênh lệch kiểm kê "lớn": vượt ngưỡng % so với tồn sổ (hoặc tồn sổ = 0 mà đếm được hàng) — phải ghi chú giải thích. */
export const STOCKTAKE_LARGE_DIFF_PCT = 10;
export const STOCKTAKE_LARGE_DIFF_NOTE_MIN = 5;
export function isLargeStocktakeDiff(systemQty: number, countedQty: number): boolean {
  const diff = Math.abs(countedQty - systemQty);
  if (diff < 0.0005) return false;
  if (systemQty <= 0) return true;
  return (diff / systemQty) * 100 > STOCKTAKE_LARGE_DIFF_PCT;
}
