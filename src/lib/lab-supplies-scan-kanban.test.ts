import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KANBAN_COLUMNS, findItemByScan, itemStockStatus, kanbanColumnFor, normalizeScanCode } from "./lab-supplies";
import { buildLabelHtml, labelValue } from "./lab-supplies-label";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("quét mã: chuẩn hóa và tìm vật tư", () => {
  const items = [
    { id: "a", code: "HC001", barcode: "8935012345678" },
    { id: "b", code: "HC002", barcode: null },
    { id: "c", code: "8935012345678", barcode: null }, // mã quản lý trùng mã vạch của vật tư a: mã vạch phải thắng
  ];
  it("bỏ ký tự điều khiển/xuống dòng của máy quét USB và khoảng trắng", () => {
    expect(normalizeScanCode(" HC001\r\n")).toBe("HC001");
    expect(normalizeScanCode("\u0000HC\u001f001\u007f")).toBe("HC001");
    expect(normalizeScanCode(null)).toBe("");
  });
  it("tìm theo mã vạch trước, rồi mã quản lý; không phân biệt hoa/thường", () => {
    expect(findItemByScan(items, "8935012345678")?.id).toBe("a");
    expect(findItemByScan(items, "hc002\n")?.id).toBe("b");
    expect(findItemByScan(items, "HC001")?.id).toBe("a");
  });
  it("không có mã hoặc không khớp thì trả null", () => {
    expect(findItemByScan(items, "")).toBeNull();
    expect(findItemByScan(items, "   ")).toBeNull();
    expect(findItemByScan(items, "KHONG-CO")).toBeNull();
  });
});

describe("Kanban bổ sung: mỗi vật tư đúng 1 cột theo mức khẩn", () => {
  it("thứ tự ưu tiên: hết hàng > lô hết hạn > dưới định mức > lô sắp hết hạn > đủ", () => {
    expect(kanbanColumnFor("OUT", 0, 0)).toBe("OUT");
    expect(kanbanColumnFor("LOW", 2, 1)).toBe("EXPIRED");
    expect(kanbanColumnFor("OK", 1, 0)).toBe("EXPIRED");
    expect(kanbanColumnFor("LOW", 0, 3)).toBe("LOW");
    expect(kanbanColumnFor("OK", 0, 2)).toBe("EXPIRING");
    expect(kanbanColumnFor("OK", 0, 0)).toBe("OK");
  });
  it("khớp cách tính tồn thấp của bảng Tồn kho (itemStockStatus)", () => {
    expect(kanbanColumnFor(itemStockStatus(0, 5), 0, 0)).toBe("OUT");
    expect(kanbanColumnFor(itemStockStatus(5, 5), 0, 0)).toBe("LOW");
    expect(kanbanColumnFor(itemStockStatus(6, 5), 0, 0)).toBe("OK");
    expect(kanbanColumnFor(itemStockStatus(3, 0), 0, 0)).toBe("OK");
  });
  it("5 cột, khóa không trùng, có nhãn tiếng Việt", () => {
    expect(KANBAN_COLUMNS.map((c) => c.key)).toEqual(["OUT", "EXPIRED", "LOW", "EXPIRING", "OK"]);
    expect(new Set(KANBAN_COLUMNS.map((c) => c.label)).size).toBe(5);
  });
});

describe("tem QR", () => {
  it("giá trị tem: mã vạch nếu có, không thì mã vật tư", () => {
    expect(labelValue({ code: "HC001", barcode: " 893 " })).toBe("893");
    expect(labelValue({ code: "HC001", barcode: null })).toBe("HC001");
    expect(labelValue({ code: "HC001", barcode: "  " })).toBe("HC001");
  });
  it("escape HTML trong tên/mã", () => {
    const html = buildLabelHtml({ code: "A<1>", name: 'Thuốc "thử" & <b>', unit: "hộp" }, "A<1>", "data:image/png;base64,xx");
    expect(html).toContain("A&lt;1&gt;");
    expect(html).toContain("Thuốc &quot;thử&quot; &amp; &lt;b&gt;");
    expect(html).not.toContain("<b>");
  });
});

describe("mã vạch: form → body → API → SELECT → DB nhất quán", () => {
  const client = read("src/components/lab-supplies-client.tsx");
  const api = read("src/lib/lab-supplies-api.ts");
  const post = read("src/app/api/lab-supplies/items/route.ts");
  const patch = read("src/app/api/lab-supplies/items/[id]/route.ts");
  const migration = read("supabase/migrations/20261202000000_lab_supplies_barcode_v1.sql");
  it("form có ô mã vạch, gửi trong body, API xử lý cả tạo mới lẫn sửa, SELECT trả về", () => {
    const catalog = read("src/components/lab-supplies-catalog.tsx");
    expect(catalog).toContain("barcode: form.barcode.trim() || null");
    expect(catalog).toContain("barcode: i.barcode || \"\"");
    expect(post).toContain("barcode: barcode.value");
    expect(patch).toContain("patch.barcode = barcode.value");
    expect(api).toMatch(/ITEM_SELECT = "id,code,barcode,/);
  });
  it("trùng mã vạch trả 409 với thông báo tiếng Việt (tạo mới và sửa)", () => {
    expect(post).toContain("đã gắn cho vật tư khác");
    expect(patch).toContain("Mã vạch này đã gắn cho vật tư khác.");
  });
  it("migration chỉ THÊM cột nullable + chỉ mục duy nhất theo tổ chức, không đụng sổ bất biến", () => {
    expect(migration).toContain("add column if not exists barcode text");
    expect(migration).toContain("create unique index if not exists lab_supply_items_org_barcode_uidx");
    expect(migration).toContain("(organization_id, lower(btrim(barcode)))");
    expect(migration).not.toMatch(/drop |delete |truncate |lab_supply_movements/i);
  });
  it("không thêm route/quyền mới: tra cứu dùng dữ liệu đã tải theo quyền xem sẵn có", () => {
    expect(client).toContain("findItemByScan(items, code)");
  });
});

describe("khung quét và bảng Kanban trên giao diện", () => {
  const client = read("src/components/lab-supplies-client.tsx");
  const scanner = read("src/components/lab-supplies-scanner.tsx");
  it("có nút Quét mã; Kanban là cách xem của Tồn kho (cùng dữ liệu), không còn tab riêng", () => {
    expect(client).toContain("Quét mã</button>");
    expect(client).not.toContain("Kanban bổ sung");
    const stock = read("src/components/lab-supplies-stock.tsx");
    expect(stock).toContain("KANBAN_COLUMNS.map((col)");
    expect(stock).toContain('onClick={() => setView("kanban")}');
  });
  it("máy quét USB: ô nhập có sẵn, Enter để tra cứu; camera dùng BarcodeDetector rồi @zxing/browser", () => {
    expect(scanner).toContain("Quét hoặc gõ mã vạch / mã vật tư rồi Enter");
    expect(scanner).toContain("BarcodeDetector");
    expect(scanner).toContain('import("@zxing/browser")');
  });
  it("giải phóng camera khi đóng (không để đèn camera sáng)", () => {
    expect(scanner).toContain("stream?.getTracks().forEach((t) => t.stop())");
    expect(scanner).toContain("controls?.stop()");
    expect(scanner).toContain("cancelAnimationFrame(raf)");
  });
  it("mã không tìm thấy: báo rõ, người có quyền quản lý được thêm vật tư mới với mã này", () => {
    expect(scanner).toContain("Không tìm thấy vật tư có mã");
    expect(client).toContain("onCreateItem={canManage ?");
    expect(client).toContain("setCatalogSeed({ barcode: code, key: Date.now() })");
  });
  it("kho vẫn độc lập: không import module khác ngoài hạ tầng chung", () => {
    for (const f of [client, scanner]) expect(f).not.toMatch(/procurement|medical-equipment|emr-|procedure-training|incident/);
  });
});
