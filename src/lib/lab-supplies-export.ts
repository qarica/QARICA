// Xuất Excel (.xlsx thật) cho Kho hóa chất & VTYT XN. File này CHỈ dựng dữ liệu bảng (hàm thuần, không import "@/...",
// kiểm thử được); việc ghi ra .xlsx nằm ở lab-supplies-xlsx.ts. Số lượng là SỐ (Excel cộng/lọc được), không phải chữ.
import { CATEGORY_LABEL, MOVEMENT_LABEL, REASON_LABEL, daysUntilExpiry, fmtDate, itemStockStatus, lotExpiryStatus, suggestedOrderQuantity, type MovementType, type SupplyCategory } from "./lab-supplies";

export type Cell = string | number;

/** Ngày trong file Excel luôn là dd/mm/yyyy; trống thì để ô trống. */
const vn = (iso?: string | null): string => (iso ? fmtDate(iso) : "");
export type SheetSpec = { name: string; title: string; headers: string[]; rows: Cell[][]; emptyText: string; widths?: number[] };

/** Thêm cột STT (số thứ tự) ở đầu mọi bảng chưa có — quy ước chung cho mọi bảng xuất của kho. */
export function withStt(sheet: SheetSpec): SheetSpec {
  if (sheet.headers[0] === "STT") return sheet;
  return { ...sheet, headers: ["STT", ...sheet.headers], rows: sheet.rows.map((r, i) => [i + 1, ...r]), widths: sheet.widths ? [6, ...sheet.widths] : undefined };
}

export type ExportItem = { id: string; code: string; barcode: string | null; name: string; category: SupplyCategory; unit: string; manufacturer: string | null; storage_condition: string | null; min_stock: number | string; expiry_warning_days: number; is_active: boolean };
export type ExportLot = { lot_id: string; item_id: string; lot_number: string; expiry_date: string | null; balance: number | string };
export type ExportMovement = {
  movement_date: string;
  created_at: string;
  movement_type: MovementType;
  quantity_delta: number | string;
  reference_no: string | null;
  counterparty: string | null;
  reason_code: string | null;
  note: string | null;
  item?: { code: string; name: string; unit: string } | null;
  lot?: { lot_number: string; expiry_date: string | null } | null;
};

const num = (v: unknown) => Number(v ?? 0);
const STOCK_LABEL = { OUT: "Hết hàng", LOW: "Sắp hết", OK: "Đủ" } as const;
const EXPIRY_LABEL = { NO_EXPIRY: "Không có hạn", EXPIRED: "Đã hết hạn", EXPIRING: "Sắp hết hạn", OK: "Còn hạn" } as const;
const reasonText = (m: ExportMovement) => (m.reason_code ? REASON_LABEL[m.reason_code] || m.reason_code : "");

/** Tồn hiện tại: 2 trang tính — theo vật tư và chi tiết theo lô (hạn dùng gần nhất trước). */
export function buildStockSheets(items: ExportItem[], lots: ExportLot[], today: string): SheetSpec[] {
  const lotsByItem = new Map<string, ExportLot[]>();
  for (const l of lots) lotsByItem.set(l.item_id, [...(lotsByItem.get(l.item_id) || []), l]);
  const itemRows: Cell[][] = [];
  const lotRows: Cell[][] = [];
  let n = 0;
  for (const item of items) {
    const itemLots = (lotsByItem.get(item.id) || []).filter((l) => num(l.balance) > 0);
    const total = itemLots.reduce((s, l) => s + num(l.balance), 0);
    if (!item.is_active && total === 0) continue;
    n++;
    const stock = itemStockStatus(total, num(item.min_stock));
    const expiries = itemLots.map((l) => l.expiry_date).filter(Boolean).sort() as string[];
    itemRows.push([n, item.code, item.barcode || "", item.name, CATEGORY_LABEL[item.category], item.unit, total, num(item.min_stock), STOCK_LABEL[stock], itemLots.length, vn(expiries[0]), item.is_active ? "Đang dùng" : "Ngưng dùng"]);
    for (const l of [...itemLots].sort((a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999"))) {
      const st = lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today);
      const d = daysUntilExpiry(l.expiry_date, today);
      lotRows.push([item.code, item.name, l.lot_number, vn(l.expiry_date), d === null ? "" : d, EXPIRY_LABEL[st], num(l.balance), item.unit]);
    }
  }
  return [
    { name: "Tồn theo vật tư", title: `Tồn kho hóa chất & VTYT xét nghiệm — tại ngày ${vn(today)}`, headers: ["STT", "Mã VT", "Mã vạch", "Tên vật tư", "Nhóm", "ĐVT", "Tồn", "Định mức tối thiểu", "Tình trạng tồn", "Số lô còn tồn", "Hạn dùng gần nhất", "Trạng thái"], rows: itemRows, emptyText: "Chưa có vật tư.", widths: [6, 12, 16, 34, 22, 8, 10, 12, 14, 10, 14, 12] },
    { name: "Tồn theo lô", title: "Chi tiết tồn theo lô (hạn dùng gần nhất trước)", headers: ["Mã VT", "Tên vật tư", "Số lô", "Hạn dùng", "Số ngày còn lại", "Tình trạng hạn", "Tồn", "ĐVT"], rows: lotRows, emptyText: "Chưa có lô nào còn tồn.", widths: [12, 34, 16, 13, 12, 16, 10, 8] },
  ].map(withStt);
}

/** Sổ xuất nhập trong khoảng ngày (mới nhất trước). Số lượng: + nhập / − xuất. */
export function buildLedgerSheets(rows: ExportMovement[], from: string, to: string): SheetSpec[] {
  const data: Cell[][] = rows.map((m, i) => [i + 1, vn(m.movement_date), MOVEMENT_LABEL[m.movement_type], m.item?.code || "", m.item?.name || "", m.lot?.lot_number || "", vn(m.lot?.expiry_date), num(m.quantity_delta), m.item?.unit || "", m.reference_no || "", m.counterparty || "", reasonText(m), m.note || ""]);
  return [{ name: "Sổ xuất nhập", title: `Sổ xuất nhập kho hóa chất & VTYT xét nghiệm — từ ${vn(from)} đến ${vn(to)}`, headers: ["STT", "Ngày", "Loại phiếu", "Mã VT", "Tên vật tư", "Số lô", "Hạn dùng", "Số lượng (+nhập / −xuất)", "ĐVT", "Số phiếu", "Người nhận / NCC", "Lý do", "Ghi chú"], rows: data, emptyText: "Không có phiếu nào trong khoảng ngày này.", widths: [6, 12, 12, 12, 32, 14, 13, 14, 8, 14, 22, 18, 28] }];
}

/** Tồn lũy kế sau từng dòng (sổ sắp theo thời gian tăng dần), làm tròn 3 chữ số. */
export function runningBalances(deltas: (number | string)[]): number[] {
  let sum = 0;
  return deltas.map((d) => {
    sum = Math.round((sum + num(d)) * 1000) / 1000;
    return sum;
  });
}

/** Thẻ kho 1 vật tư: toàn bộ nhập–xuất theo thời gian, có tồn lũy kế. `rows` đã sắp tăng dần. */
export function buildCardSheets(item: { code: string; name: string; unit: string; barcode?: string | null }, rows: ExportMovement[]): SheetSpec[] {
  const bal = runningBalances(rows.map((r) => r.quantity_delta));
  const data: Cell[][] = rows.map((m, i) => [vn(m.movement_date), MOVEMENT_LABEL[m.movement_type], m.lot?.lot_number || "", vn(m.lot?.expiry_date), num(m.quantity_delta) > 0 ? num(m.quantity_delta) : "", num(m.quantity_delta) < 0 ? Math.abs(num(m.quantity_delta)) : "", bal[i], m.reference_no || "", m.counterparty || "", reasonText(m), m.note || ""]);
  return [{ name: "Thẻ kho", title: `Thẻ kho — ${item.code} · ${item.name} (${item.unit})${item.barcode ? ` · mã vạch ${item.barcode}` : ""}`, headers: ["Ngày", "Loại phiếu", "Số lô", "Hạn dùng", "Nhập", "Xuất", "Tồn lũy kế", "Số phiếu", "Người nhận / NCC", "Lý do", "Ghi chú"], rows: data, emptyText: "Vật tư chưa có phiếu nào.", widths: [12, 12, 14, 13, 10, 10, 12, 14, 22, 18, 28] }].map(withStt);
}

/**
 * Danh sách CẦN BỔ SUNG / ĐẶT HÀNG: vật tư đang dùng mà hết hàng hoặc tồn ≤ định mức tối thiểu, kèm số lượng đề nghị đặt
 * (đưa tồn lên 2× định mức) và các lô hết hạn/sắp hết hạn cần xử lý.
 */
export function buildReplenishmentSheets(items: ExportItem[], lots: ExportLot[], today: string): SheetSpec[] {
  const lotsByItem = new Map<string, ExportLot[]>();
  for (const l of lots) lotsByItem.set(l.item_id, [...(lotsByItem.get(l.item_id) || []), l]);
  const need: Cell[][] = [];
  const attention: Cell[][] = [];
  let n = 0;
  for (const item of items) {
    if (!item.is_active) continue;
    const itemLots = (lotsByItem.get(item.id) || []).filter((l) => num(l.balance) > 0);
    const total = itemLots.reduce((s, l) => s + num(l.balance), 0);
    const stock = itemStockStatus(total, num(item.min_stock));
    if (stock !== "OK") {
      n++;
      const suggest = suggestedOrderQuantity(total, num(item.min_stock));
      need.push([n, item.code, item.barcode || "", item.name, item.unit, item.manufacturer || "", total, num(item.min_stock), suggest > 0 ? suggest : "Chưa đặt định mức", stock === "OUT" ? "Hết hàng" : "Dưới định mức"]);
    }
    for (const l of itemLots) {
      const st = lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today);
      if (st === "EXPIRED" || st === "EXPIRING") {
        const d = daysUntilExpiry(l.expiry_date, today);
        attention.push([item.code, item.name, l.lot_number, vn(l.expiry_date), d === null ? "" : d, num(l.balance), item.unit, st === "EXPIRED" ? "Đã hết hạn — lập phiếu hủy" : "Sắp hết hạn — ưu tiên xuất trước"]);
      }
    }
  }
  return [
    { name: "Cần bổ sung", title: `Danh sách cần bổ sung / đặt hàng — tại ngày ${vn(today)} (đề nghị đặt = 2 × định mức − tồn hiện tại)`, headers: ["STT", "Mã VT", "Mã vạch", "Tên vật tư", "ĐVT", "Hãng SX", "Tồn", "Định mức tối thiểu", "Đề nghị đặt", "Lý do"], rows: need, emptyText: "Không có vật tư nào cần bổ sung.", widths: [6, 12, 16, 34, 8, 18, 10, 12, 16, 16] },
    { name: "Lô cần xử lý", title: "Lô cần xử lý hạn dùng", headers: ["Mã VT", "Tên vật tư", "Số lô", "Hạn dùng", "Số ngày còn lại", "Tồn", "ĐVT", "Việc cần làm"], rows: attention, emptyText: "Không có lô nào hết hạn hoặc sắp hết hạn.", widths: [12, 34, 16, 13, 12, 10, 8, 34] },
  ].map(withStt);
}

export type ReportRow = { code: string; name: string; unit: string; category: SupplyCategory; opening: number; receipts: number; issues: number; disposals: number; adjustments: number; closing: number };

/** Báo cáo Nhập–Xuất–Tồn theo kỳ. */
export function buildReportSheets(rows: ReportRow[], from: string, to: string): SheetSpec[] {
  const data: Cell[][] = rows.map((r) => [r.code, r.name, CATEGORY_LABEL[r.category], r.unit, num(r.opening), num(r.receipts), num(r.issues), num(r.disposals), num(r.adjustments), num(r.closing)]);
  return [{ name: "Nhập-Xuất-Tồn", title: `Báo cáo Nhập – Xuất – Tồn kho hóa chất & VTYT xét nghiệm — từ ${vn(from)} đến ${vn(to)}`, headers: ["Mã VT", "Tên vật tư", "Nhóm", "ĐVT", "Tồn đầu kỳ", "Nhập trong kỳ", "Xuất dùng", "Hủy hàng", "Điều chỉnh (kiểm kê/hao hụt)", "Tồn cuối kỳ"], rows: data, emptyText: "Không có số liệu trong kỳ.", widths: [12, 34, 22, 8, 12, 12, 12, 12, 16, 12] }].map(withStt);
}

export function buildImportTemplateSheets(headers: string[]): SheetSpec[] {
  const example: Cell[] = ["HC001", "Thuốc thử Glucose", "Hóa chất", "Hộp", "Roche", "8930000000011", 5, 30, "2–8°C", ""];
  return [{ name: "Danh mục vật tư", title: "Mẫu nhập danh mục vật tư. Dòng 3 là VÍ DỤ — ghi đè hoặc xóa, điền danh mục từ dòng 3 trở xuống rồi lưu .xlsx và tải lên. Cột có dấu * là bắt buộc. Nhóm: Hóa chất / Vật tư tiêu hao / Chất chuẩn / Khác.", headers, rows: [example], emptyText: "", widths: [14, 34, 18, 12, 18, 18, 14, 14, 18, 24] }];
}
