import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeStockAlerts } from "./lab-supplies";

const read = (p: string) => readFileSync(p, "utf8");
const item = (id: string, min: number, over: Partial<{ is_active: boolean; expiry_warning_days: number }> = {}) => ({ id, is_active: true, min_stock: min, expiry_warning_days: 30, ...over });
const lot = (item_id: string, expiry_date: string | null, balance: number) => ({ item_id, expiry_date, balance });
const TODAY = "2026-11-26";

describe("banner nhắc việc trong Kho", () => {
  it("đếm vật tư theo mức khẩn, mỗi vật tư đúng một mức; đếm cả số lô", () => {
    const items = [item("out", 5), item("low", 10), item("exp", 2), item("soon", 6), item("ok", 5), item("zeroMin", 0)];
    const lots = [
      lot("low", "2027-01-01", 4),
      lot("exp", "2026-11-20", 3),
      lot("exp", "2026-11-01", 1),
      lot("soon", "2026-12-10", 8),
      lot("soon", "2027-06-01", 5),
      lot("ok", "2027-03-01", 12),
      lot("zeroMin", null, 1),
    ];
    const s = summarizeStockAlerts(items, lots, TODAY);
    expect(s.items).toEqual({ EXPIRED: 1, OUT: 1, LOW: 1, EXPIRING: 1 });
    expect(s.expiredLots).toBe(2);
    expect(s.expiringLots).toBe(1);
    expect(s.total).toBe(4);
  });
  it("vật tư ngưng dùng đã hết tồn không nhắc; ngưng dùng còn tồn thì vẫn nhắc", () => {
    expect(summarizeStockAlerts([item("x", 5, { is_active: false })], [], TODAY).total).toBe(0);
    expect(summarizeStockAlerts([item("x", 5, { is_active: false })], [lot("x", "2026-11-01", 2)], TODAY).items.EXPIRED).toBe(1);
  });
  it("lô tồn 0 không tính (vật tư đang dùng mà hết tồn là Hết hàng); không có gì cần xử lý thì tổng bằng 0", () => {
    const s0 = summarizeStockAlerts([item("a", 0)], [lot("a", "2026-01-01", 0)], TODAY);
    expect(s0.items).toEqual({ EXPIRED: 0, OUT: 1, LOW: 0, EXPIRING: 0 });
    expect(s0.expiredLots).toBe(0);
    expect(summarizeStockAlerts([item("a", 5)], [lot("a", "2027-06-01", 50)], TODAY).total).toBe(0);
  });
  it("cùng cách phân loại với Kanban: có lô hết hạn thì tính là hết hạn, không đếm thêm vào dưới định mức", () => {
    const s = summarizeStockAlerts([item("a", 10)], [lot("a", "2026-11-01", 3)], TODAY);
    expect(s.items).toEqual({ EXPIRED: 1, OUT: 0, LOW: 0, EXPIRING: 0 });
  });
  it("banner gắn ở đầu mọi tab, bấm mục nào lọc sẵn Tồn kho theo mục đó", () => {
    const c = read("src/components/lab-supplies-client.tsx");
    expect(c).toContain("<LabAlertBanner ");
    expect(c).toContain('changeTab("stock")');
    expect(c).toContain("filterReq={stockFilter}");
    const stock = read("src/components/lab-supplies-stock.tsx");
    expect(stock).toContain("filterReq");
    expect(stock).toContain("setFilter(filterReq.value)");
    const b = read("src/components/lab-supplies-alerts.tsx");
    expect(b).toContain("summarizeStockAlerts");
    expect(b).toContain("/api/lab-supplies/export?type=replenish");
    expect(b).toContain("if (s.total === 0) return null");
  });
});
