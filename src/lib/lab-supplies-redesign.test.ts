import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allocateFefo, suggestedOrderQuantity } from "./lab-supplies";
import { buildReplenishmentSheets } from "./lab-supplies-export";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const lot = (id: string, number: string, expiry: string | null, balance: number) => ({ lot_id: id, lot_number: number, expiry_date: expiry, balance });

describe("xuất kho thông minh: tự phân bổ lô theo FEFO", () => {
  const today = "2026-11-26";
  const lots = [lot("b", "B", "2027-03-01", 5), lot("a", "A", "2026-12-10", 3), lot("x", "X", "2026-11-01", 4), lot("n", "N", null, 9)];
  it("xuất dùng: bỏ lô đã hết hạn, lấy lô hạn gần nhất trước, trải qua nhiều lô", () => {
    const r = allocateFefo(lots, 6, "ISSUE", today);
    expect(r.allocations.map((a) => [a.lot_id, a.quantity])).toEqual([["a", 3], ["b", 3]]);
    expect(r.shortage).toBe(0);
  });
  it("lô không có hạn xếp sau cùng; báo thiếu khi tồn không đủ (không tính lô hết hạn)", () => {
    const r = allocateFefo(lots, 20, "ISSUE", today);
    expect(r.allocations.map((a) => a.lot_id)).toEqual(["a", "b", "n"]);
    expect(r.shortage).toBe(3); // 3 + 5 + 9 = 17 < 20
  });
  it("hủy hàng: lô hết hạn trước, rồi mới tới các lô còn hạn", () => {
    const r = allocateFefo(lots, 5, "DISPOSAL", today);
    expect(r.allocations.map((a) => [a.lot_id, a.quantity])).toEqual([["x", 4], ["a", 1]]);
  });
  it("2 dòng cùng vật tư không dùng trùng tồn (used)", () => {
    const first = allocateFefo(lots, 3, "ISSUE", today);
    const used: Record<string, number> = {};
    for (const a of first.allocations) used[a.lot_id] = a.quantity;
    const second = allocateFefo(lots, 4, "ISSUE", today, used);
    expect(second.allocations.map((a) => [a.lot_id, a.quantity])).toEqual([["b", 4]]);
  });
  it("số lẻ thập phân không sai số, số lượng 0 không phân bổ", () => {
    expect(allocateFefo([lot("a", "A", null, 0.3)], 0.1, "ISSUE", today).allocations[0].quantity).toBe(0.1);
    const r = allocateFefo([lot("a", "A", null, 0.3)], 0.1 + 0.2, "ISSUE", today);
    expect(r.shortage).toBe(0);
    expect(allocateFefo(lots, 0, "ISSUE", today).allocations).toEqual([]);
  });
});

describe("đề nghị đặt hàng", () => {
  it("đưa tồn lên 2× định mức; không đề xuất khi chưa có định mức hoặc tồn còn trên định mức", () => {
    expect(suggestedOrderQuantity(0, 5)).toBe(10);
    expect(suggestedOrderQuantity(3, 5)).toBe(7);
    expect(suggestedOrderQuantity(5, 5)).toBe(5);
    expect(suggestedOrderQuantity(6, 5)).toBe(0);
    expect(suggestedOrderQuantity(0, 0)).toBe(0);
  });
  it("file Excel: liệt kê vật tư dưới định mức + lô hết hạn/sắp hết hạn, bỏ vật tư ngưng dùng", () => {
    const base = { barcode: null, category: "REAGENT" as const, unit: "hộp", manufacturer: null, storage_condition: null, expiry_warning_days: 30, is_active: true };
    const items = [
      { ...base, id: "1", code: "HC1", name: "Hết hàng", min_stock: 4 },
      { ...base, id: "2", code: "HC2", name: "Đủ hàng", min_stock: 2 },
      { ...base, id: "3", code: "HC3", name: "Ngưng dùng", min_stock: 4, is_active: false },
      { ...base, id: "4", code: "HC4", name: "Có lô hết hạn", min_stock: 1 },
    ];
    const lots = [
      { lot_id: "l2", item_id: "2", lot_number: "L2", expiry_date: "2027-06-01", balance: 10 },
      { lot_id: "l4", item_id: "4", lot_number: "L4", expiry_date: "2026-11-01", balance: 3 },
      { lot_id: "l4b", item_id: "4", lot_number: "L4B", expiry_date: "2026-12-05", balance: 2 },
    ];
    const [need, attention] = buildReplenishmentSheets(items, lots, "2026-11-26");
    const codes = need.rows.map((r) => r[1]);
    expect(codes).toEqual(["HC1"]);
    expect(need.rows[0][6]).toBe(0); // tồn
    expect(need.rows[0][8]).toBe(8); // đề nghị đặt 2×4−0
    expect(attention.rows.map((r) => [r[1], r[3], r[8]])).toEqual([["HC4", "L4", "Đã hết hạn — lập phiếu hủy"], ["HC4", "L4B", "Sắp hết hạn — ưu tiên xuất trước"]]);
  });
});

describe("thiết kế lại giao diện kho theo luồng nghiệp vụ", () => {
  const client = read("src/components/lab-supplies-client.tsx");
  it("6 tab đúng thứ tự công việc thủ kho", () => {
    expect(client).toContain('["stock", "receipt", "issue", "stocktake", "ledger", "catalog"]');
    for (const label of ["Tồn kho", "Nhập kho", "Xuất kho", "Kiểm kê & chốt kỳ", "Sổ kho & báo cáo", "Danh mục"]) expect(client).toContain(`"${label}"`);
  });
  it("không còn chức năng trùng: không tab Kanban/Báo cáo/Kiểm kê riêng, không nút Phiếu … nhiều dòng, không modal 1 dòng", () => {
    const all = ["client", "stock", "voucher", "detail", "ledger", "stocktake", "catalog"].map((n) => read(`src/components/lab-supplies-${n}.tsx`)).join("\n");
    expect(all).not.toContain("Kanban bổ sung");
    expect(all).not.toContain("Phiếu nhập nhiều dòng");
    expect(all).not.toContain("Phiếu xuất nhiều dòng");
    expect(all).not.toContain("openMove(");
    expect(all).not.toContain("LabBatchDialog");
  });
  it("Hủy hàng gộp vào Xuất kho (cùng một form); Kanban gộp vào Tồn kho (nút chuyển cách xem)", () => {
    const voucher = read("src/components/lab-supplies-voucher.tsx");
    expect(voucher).toContain('aria-label="Loại phiếu xuất"');
    expect(voucher).toContain(">Hủy hàng</button>");
    const stock = read("src/components/lab-supplies-stock.tsx");
    expect(stock).toContain('aria-label="Cách xem"');
    expect(stock).toContain(">Kanban</button>");
  });
  it("một nút Xuất Excel gom các loại ở Tồn kho; Sổ kho gom Phiếu / Thẻ kho / Nhập–Xuất–Tồn", () => {
    const stock = read("src/components/lab-supplies-stock.tsx");
    expect((stock.match(/<summary className="button secondary">/g) || []).length).toBe(1);
    expect(stock).toContain("export?type=replenish");
    const ledger = read("src/components/lab-supplies-ledger.tsx");
    for (const label of [">Phiếu</button>", ">Thẻ kho vật tư</button>", ">Nhập–Xuất–Tồn theo kỳ</button>"]) expect(ledger).toContain(label);
  });
  it("kiểm kê và chốt kỳ liền nhau trên một màn hình; quét mã ăn theo màn hình đang mở", () => {
    const st = read("src/components/lab-supplies-stocktake.tsx");
    expect(st.indexOf("1. Kiểm kê")).toBeLessThan(st.indexOf("3. Chốt kỳ"));
    expect(client).toContain("canManage && voucherTab");
    expect(client).toContain("continuous={canManage && voucherTab}");
  });
  it("người chỉ có quyền xem không thấy tab ghi phiếu", () => {
    expect(client).toContain('canManage ? ["stock", "receipt", "issue", "stocktake", "ledger", "catalog"] : ["stock", "ledger", "catalog"]');
  });
});
