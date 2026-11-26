// Kiểu dữ liệu dùng chung cho các màn hình Kho hóa chất & VTYT XN.
import type { MovementType, SupplyCategory } from "../lib/lab-supplies";

export type Item = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  category: SupplyCategory;
  unit: string;
  manufacturer: string | null;
  storage_condition: string | null;
  min_stock: number | string;
  expiry_warning_days: number;
  is_active: boolean;
  notes: string | null;
};
export type Lot = { lot_id: string; item_id: string; lot_number: string; expiry_date: string | null; balance: number | string };
export type Movement = {
  id: string;
  movement_type: MovementType;
  quantity_delta: number | string;
  movement_date: string;
  reference_no: string | null;
  counterparty: string | null;
  reason_code: string | null;
  note: string | null;
  system_quantity: number | string | null;
  counted_quantity: number | string | null;
  created_at: string;
  actor_name: string;
  item: { code: string; name: string; unit: string } | null;
  lot: { lot_number: string; expiry_date: string | null } | null;
};
export type Closing = { id: string; period_end: string; note: string | null } | null;
export type Toast = { tone: "success" | "error"; text: string } | null;

export const num = (v: number | string | null | undefined) => Number(v ?? 0);

export async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Thao tác không thành công.");
  return json;
}

/** Tên hiển thị trong ô chọn vật tư (datalist): "MÃ — Tên". */
export const itemLabel = (i: { code: string; name: string }) => `${i.code} — ${i.name}`;

/** Từ chữ người dùng gõ/chọn tìm ra vật tư: khớp nhãn "MÃ — Tên", mã vật tư hoặc mã vạch (không phân biệt hoa/thường). */
export function resolveItem(items: Item[], text: string): Item | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return items.find((i) => itemLabel(i).toLowerCase() === t) ?? items.find((i) => i.code.toLowerCase() === t) ?? items.find((i) => (i.barcode || "").toLowerCase() === t) ?? null;
}
