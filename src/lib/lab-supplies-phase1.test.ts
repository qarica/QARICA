import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareStockUrgency, sortLotsFefo, type KanbanColumnKey } from "./lab-supplies";

const row = (code: string, column: KanbanColumnKey, nextExpiry: string | null) => ({ item: { code }, column, nextExpiry });

describe("Tồn kho xếp theo mức khẩn", () => {
  it("hết hạn → hết hàng → dưới định mức → sắp hết hạn → đủ; cùng mức thì hạn gần nhất trước, không hạn xuống cuối", () => {
    const rows = [
      row("E", "OK", "2027-06-01"),
      row("D", "EXPIRING", "2026-12-10"),
      row("C2", "LOW", null),
      row("C1", "LOW", "2027-01-01"),
      row("B", "OUT", null),
      row("A", "EXPIRED", "2026-11-20"),
      row("E0", "OK", "2027-01-01"),
    ];
    expect([...rows].sort(compareStockUrgency).map((r) => r.item.code)).toEqual(["A", "B", "C1", "C2", "D", "E0", "E"]);
  });
  it("cùng mức và cùng hạn thì theo mã vật tư", () => {
    expect([row("HC2", "OK", null), row("HC1", "OK", null)].sort(compareStockUrgency).map((r) => r.item.code)).toEqual(["HC1", "HC2"]);
  });
  it("bảng Tồn kho dùng bộ sắp xếp này", () => {
    expect(readFileSync("src/components/lab-supplies-stock.tsx", "utf8")).toContain("sort(compareStockUrgency)");
  });
});

describe("mọi bảng của Kho có cột STT", () => {
  const files = readdirSync("src/components").filter((f) => /^lab-supplies-.*\.tsx$/.test(f) && f !== "lab-supplies-import-dialog.tsx");
  it("mỗi <thead> bắt đầu bằng STT, mỗi dòng dữ liệu có ô STT", () => {
    let tables = 0;
    for (const f of files) {
      const src = readFileSync(`src/components/${f}`, "utf8");
      const heads = src.match(/<thead><tr>(.{0,60})/g) || [];
      for (const h of heads) {
        tables += 1;
        expect(h, `${f}: ${h}`).toContain('<th className="ls-stt">STT</th>');
      }
      expect((src.match(/<td className="ls-stt">\{idx \+ 1\}<\/td>/g) || []).length, f).toBe(heads.length);
    }
    expect(tables).toBeGreaterThanOrEqual(9);
  });
  it("bảng xuất Excel đều qua withStt", () => {
    const src = readFileSync("src/lib/lab-supplies-export.ts", "utf8");
    expect((src.match(/\.map\(withStt\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

describe("xuất tay không theo FEFO: cảnh báo, không chặn", () => {
  const v = readFileSync("src/components/lab-supplies-voucher.tsx", "utf8");
  it("có cảnh báo khi còn lô hạn sớm hơn lô đã chọn tay (chỉ xuất dùng)", () => {
    expect(v).toContain("ls-fefo-warn");
    expect(v).toContain('l.manualLot && mode === "ISSUE"');
    expect(v).toContain("Không theo FEFO");
  });
  it("cảnh báo không nằm trong danh sách lỗi chặn ghi phiếu", () => {
    const problems = v.slice(v.indexOf("const problems"), v.indexOf("async function submit"));
    expect(problems).not.toContain("older");
  });
  it("lô hết hạn sớm nhất được tính theo FEFO", () => {
    expect(sortLotsFefo([{ lot_number: "B", expiry_date: "2027-01-01" }, { lot_number: "A", expiry_date: "2026-12-01" }, { lot_number: "N", expiry_date: null }]).map((l) => l.lot_number)).toEqual(["A", "B", "N"]);
  });
});

describe("hướng dẫn thao tác trong từng tab", () => {
  it("tab Kiểm kê & chốt kỳ và Sổ kho & báo cáo có hướng dẫn mở sẵn; Nhập/Xuất có hướng dẫn gập", () => {
    expect(readFileSync("src/components/lab-supplies-stocktake.tsx", "utf8")).toContain("<LabGuide {...STOCKTAKE_GUIDE} defaultOpen />");
    expect(readFileSync("src/components/lab-supplies-ledger.tsx", "utf8")).toContain("<LabGuide {...LEDGER_GUIDE} defaultOpen />");
    expect(readFileSync("src/components/lab-supplies-voucher.tsx", "utf8")).toContain("RECEIPT_GUIDE : ISSUE_GUIDE");
  });
});
