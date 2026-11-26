// Xuất Excel cho Kho hóa chất & VTYT XN — cùng mẫu HTML-table-as-.xls đã dùng ở các export khác của hệ thống.
// Hàm thuần (không import "@/...") để kiểm thử. Dữ liệu do route dựng từ DB theo đúng tổ chức của người gọi.
import { CATEGORY_LABEL, MOVEMENT_LABEL, REASON_LABEL, daysUntilExpiry, formatQuantity, itemStockStatus, lotExpiryStatus, type MovementType, type SupplyCategory } from "./lab-supplies";

export const escHtml = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

export function wrapXls(body: string): string {
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
      table{border-collapse:collapse;font-family:Arial;font-size:10pt}th,td{border:1px solid #777;padding:5px;vertical-align:top;white-space:pre-wrap}th{background:#e5e7eb;font-weight:bold}caption{font-weight:bold;text-align:left;padding:6px 0;font-size:11pt}
    </style></head><body>${body}</body></html>`;
}

export function tableHtml(caption: string, headers: string[], rows: (string | number)[][], emptyText: string): string {
  const head = headers.map((h) => `<th>${escHtml(h)}</th>`).join("");
  const body = rows.length
    ? rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">${escHtml(emptyText)}</td></tr>`;
  return `<table><caption>${escHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><br/>`;
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

/** Tồn hiện tại: bảng theo vật tư + bảng chi tiết theo lô (FEFO). */
export function buildStockExcel(items: ExportItem[], lots: ExportLot[], today: string): string {
  const lotsByItem = new Map<string, ExportLot[]>();
  for (const l of lots) lotsByItem.set(l.item_id, [...(lotsByItem.get(l.item_id) || []), l]);
  const itemRows: (string | number)[][] = [];
  const lotRows: (string | number)[][] = [];
  let n = 0;
  for (const item of items) {
    const itemLots = (lotsByItem.get(item.id) || []).filter((l) => num(l.balance) > 0);
    const total = itemLots.reduce((s, l) => s + num(l.balance), 0);
    if (!item.is_active && total === 0) continue;
    n++;
    const stock = itemStockStatus(total, num(item.min_stock));
    const expiries = itemLots.map((l) => l.expiry_date).filter(Boolean).sort() as string[];
    itemRows.push([n, item.code, item.barcode || "", item.name, CATEGORY_LABEL[item.category], item.unit, formatQuantity(total), formatQuantity(item.min_stock), STOCK_LABEL[stock], itemLots.length, expiries[0] || "", item.is_active ? "Đang dùng" : "Ngưng dùng"]);
    for (const l of [...itemLots].sort((a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999"))) {
      const st = lotExpiryStatus(l.expiry_date, item.expiry_warning_days, today);
      const d = daysUntilExpiry(l.expiry_date, today);
      lotRows.push([item.code, item.name, l.lot_number, l.expiry_date || "", d === null ? "" : d, EXPIRY_LABEL[st], formatQuantity(l.balance), item.unit]);
    }
  }
  return wrapXls(
    tableHtml(`Tồn kho hóa chất & VTYT xét nghiệm — tại ngày ${today}`, ["STT", "Mã VT", "Mã vạch", "Tên vật tư", "Nhóm", "ĐVT", "Tồn", "Định mức tối thiểu", "Tình trạng tồn", "Số lô còn tồn", "Hạn dùng gần nhất", "Trạng thái"], itemRows, "Chưa có vật tư.") +
      tableHtml("Chi tiết tồn theo lô (hạn dùng gần nhất trước)", ["Mã VT", "Tên vật tư", "Số lô", "Hạn dùng", "Số ngày còn lại", "Tình trạng hạn", "Tồn", "ĐVT"], lotRows, "Chưa có lô nào còn tồn."),
  );
}

const reasonText = (m: ExportMovement) => (m.reason_code ? REASON_LABEL[m.reason_code] || m.reason_code : "");

/** Sổ xuất nhập trong khoảng ngày (mới nhất trước). */
export function buildLedgerExcel(rows: ExportMovement[], from: string, to: string): string {
  const data = rows.map((m, i) => [
    i + 1, m.movement_date, MOVEMENT_LABEL[m.movement_type], m.item?.code || "", m.item?.name || "", m.lot?.lot_number || "", m.lot?.expiry_date || "",
    formatQuantity(m.quantity_delta), m.item?.unit || "", m.reference_no || "", m.counterparty || "", reasonText(m), m.note || "",
  ]);
  return wrapXls(tableHtml(`Sổ xuất nhập kho hóa chất & VTYT xét nghiệm — từ ${from} đến ${to}`, ["STT", "Ngày", "Loại phiếu", "Mã VT", "Tên vật tư", "Số lô", "Hạn dùng", "Số lượng (+nhập / −xuất)", "ĐVT", "Số phiếu", "Người nhận / NCC", "Lý do", "Ghi chú"], data, "Không có phiếu nào trong khoảng ngày này."));
}

/** Tồn lũy kế sau từng dòng (sổ sắp theo thời gian tăng dần). */
export function runningBalances(deltas: (number | string)[]): number[] {
  let sum = 0;
  return deltas.map((d) => {
    sum = Math.round((sum + num(d)) * 1000) / 1000;
    return sum;
  });
}

/** Thẻ kho 1 vật tư: toàn bộ nhập–xuất theo thời gian, có tồn lũy kế. `rows` đã sắp tăng dần. */
export function buildCardExcel(item: { code: string; name: string; unit: string; barcode?: string | null }, rows: ExportMovement[]): string {
  const bal = runningBalances(rows.map((r) => r.quantity_delta));
  const data = rows.map((m, i) => [
    m.movement_date, MOVEMENT_LABEL[m.movement_type], m.lot?.lot_number || "", m.lot?.expiry_date || "", num(m.quantity_delta) > 0 ? formatQuantity(m.quantity_delta) : "", num(m.quantity_delta) < 0 ? formatQuantity(Math.abs(num(m.quantity_delta))) : "",
    formatQuantity(bal[i]), m.reference_no || "", m.counterparty || "", reasonText(m), m.note || "",
  ]);
  return wrapXls(tableHtml(`Thẻ kho — ${item.code} · ${item.name} (${item.unit})${item.barcode ? ` · mã vạch ${item.barcode}` : ""}`, ["Ngày", "Loại phiếu", "Số lô", "Hạn dùng", "Nhập", "Xuất", "Tồn lũy kế", "Số phiếu", "Người nhận / NCC", "Lý do", "Ghi chú"], data, "Vật tư chưa có phiếu nào."));
}

export function buildImportTemplateExcel(headers: string[]): string {
  const example = ["HC001", "Thuốc thử Glucose", "Hóa chất", "Hộp", "Roche", "8930000000011", 5, 30, "2–8°C", ""];
  return wrapXls(tableHtml("Mẫu nhập danh mục vật tư (mở bằng Excel, điền, rồi lưu thành .xlsx hoặc .csv). Cột có dấu * là bắt buộc. Nhóm: Hóa chất / Vật tư tiêu hao / Chất chuẩn / Khác.", headers, [example], ""));
}
