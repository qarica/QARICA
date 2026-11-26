import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns, foldHeader, parseCategory, parseItemRows } from "./lab-supplies-import";
import { buildCardSheets, buildImportTemplateSheets, buildLedgerSheets, buildReportSheets, buildStockSheets, runningBalances } from "./lab-supplies-export";
import { XLSX_CONTENT_TYPE, sheetsToXlsx, xlsxFileName } from "./lab-supplies-xlsx";
import { readSheet } from "read-excel-file/node";
import { buildCardPrintHtml } from "./lab-supplies-label";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("nhập danh mục từ Excel: nhận cột theo tên tiêu đề", () => {
  const header = ["Mã vật tư *", "Tên vật tư *", "Nhóm", "Đơn vị tính *", "Hãng sản xuất", "Mã vạch", "Định mức tối thiểu", "Báo hết hạn trước (ngày)", "Điều kiện bảo quản", "Ghi chú"];
  it("foldHeader bỏ dấu/dấu * và đ", () => {
    expect(foldHeader("Mã vật tư *")).toBe("ma vat tu");
    expect(foldHeader("Đơn vị tính")).toBe("don vi tinh");
  });
  it("tìm dòng tiêu đề dù có dòng tiêu đề báo cáo phía trên; thiếu cột bắt buộc thì báo", () => {
    const d = detectColumns([["Danh mục kho"], [], header, ["HC1", "A", "", "Hộp"]]);
    expect(d?.headerRow).toBe(2);
    expect(d?.columns.code).toBe(0);
    expect(detectColumns([["Mã vật tư", "Tên vật tư"]])).toBeNull();
    expect(parseItemRows([["x"]], new Set(), new Set()).missing.length).toBeGreaterThan(0);
  });
  it("nhóm: nhãn tiếng Việt, khóa, từ đồng nghĩa; trống = Hóa chất; lạ = lỗi", () => {
    expect(parseCategory("Hóa chất / thuốc thử")).toBe("REAGENT");
    expect(parseCategory("vật tư tiêu hao")).toBe("CONSUMABLE");
    expect(parseCategory("Chất chuẩn")).toBe("CONTROL_CALIBRATOR");
    expect(parseCategory("khac")).toBe("OTHER");
    expect(parseCategory("")).toBe("REAGENT");
    expect(parseCategory("linh tinh")).toBeNull();
  });
  it("kiểm tra từng dòng: hợp lệ, thiếu trường, trùng mã trong file/kho, trùng mã vạch, số không hợp lệ", () => {
    const rows = [
      header,
      ["hc001", "Thuốc thử A", "Hóa chất", "Hộp", "Roche", "893", "5", "30", "2–8°C", ""],
      ["HC001", "Trùng trong file", "", "Hộp"],
      ["HC002", "", "", "Hộp"],
      ["HC003", "Đã có trong kho", "", "Hộp"],
      ["HC004", "Mã vạch trùng kho", "", "Hộp", "", "EXIST-BAR"],
      ["HC005", "Định mức âm", "", "Hộp", "", "", "-1"],
      ["HC006", "Nhóm lạ", "xyz", "Hộp"],
      ["", "", "", ""],
      ["HC007", "Ngày báo lẻ", "", "Hộp", "", "", "", "1.5"],
    ];
    const { results } = parseItemRows(rows, new Set(["hc003"]), new Set(["exist-bar"]));
    const byCode: Record<string, (typeof results)[number]> = {};
    for (const r of results) if (!(r.code in byCode)) byCode[r.code] = r; // dòng đầu của mỗi mã
    expect(byCode.HC001.item?.code).toBe("HC001"); // mã viết hoa
    expect(results.filter((r) => r.code === "HC001")[1].errors.join()).toContain("lặp trong file");
    expect(byCode.HC002.errors.join()).toContain("Thiếu tên");
    expect(byCode.HC003.errors.join()).toContain("đã có trong kho");
    expect(byCode.HC004.errors.join()).toContain("Mã vạch đã gắn");
    expect(byCode.HC005.errors.join()).toContain("không âm");
    expect(byCode.HC006.errors.join()).toContain("không hợp lệ");
    expect(byCode.HC007.errors.join()).toContain("số nguyên");
    expect(results.some((r) => r.code === "" && r.name === "")).toBe(false); // dòng trống bỏ qua
    expect(byCode.HC001.item).toMatchObject({ category: "REAGENT", unit: "Hộp", manufacturer: "Roche", barcode: "893", min_stock: 5, expiry_warning_days: 30, storage_condition: "2–8°C" });
  });
});

describe("xuất Excel kho: file .xlsx thật, số là ô số", () => {
  const item = { id: "i1", code: "HC001", barcode: "893", name: "Thuốc <A>", category: "REAGENT" as const, unit: "Hộp", manufacturer: null, storage_condition: null, min_stock: 5, expiry_warning_days: 30, is_active: true };
  it("tồn lũy kế tính đúng, làm tròn 3 chữ số", () => {
    expect(runningBalances([10, "-3", -2, 0.1, 0.2])).toEqual([10, 7, 5, 5.1, 5.3]);
  });
  it("tồn kho: 2 trang tính; lô tồn 0 không liệt kê; đủ cột; số lượng là số", () => {
    const sheets = buildStockSheets([item], [{ lot_id: "l1", item_id: "i1", lot_number: "L1", expiry_date: "2026-12-30", balance: 3 }, { lot_id: "l2", item_id: "i1", lot_number: "L0", expiry_date: "2026-11-01", balance: 0 }], "2026-11-26");
    expect(sheets.map((s) => s.name)).toEqual(["Tồn theo vật tư", "Tồn theo lô"]);
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[0].rows[0].slice(0, 9)).toEqual([1, "HC001", "893", "Thuốc <A>", "Hóa chất / thuốc thử", "Hộp", 3, 5, "Sắp hết"]);
    expect(sheets[1].rows).toHaveLength(1);
    expect(sheets[1].headers[0]).toBe("STT");
    expect(sheets[1].rows[0]).toEqual([1, "HC001", "Thuốc <A>", "L1", "30/12/2026", 34, "Còn hạn", 3, "Hộp"]);
    for (const sh of sheets) for (const r of sh.rows) expect(r.length).toBe(sh.headers.length);
  });
  it("thẻ kho: cột Nhập/Xuất tách theo dấu, tồn lũy kế khớp", () => {
    const rows = [
      { movement_date: "2026-11-01", created_at: "", movement_type: "RECEIPT" as const, quantity_delta: 10, reference_no: "PN1", counterparty: "NCC", reason_code: null, note: null, lot: { lot_number: "L1", expiry_date: "2027-01-01" } },
      { movement_date: "2026-11-05", created_at: "", movement_type: "ISSUE" as const, quantity_delta: -4, reference_no: null, counterparty: "Khoa Nội", reason_code: null, note: null, lot: { lot_number: "L1", expiry_date: "2027-01-01" } },
    ];
    const [card] = buildCardSheets(item, rows);
    expect(card.rows[0]).toEqual([1, "01/11/2026", "Nhập kho", "L1", "01/01/2027", 10, "", 10, "PN1", "NCC", "", ""]);
    expect(card.rows[1]).toEqual([2, "05/11/2026", "Xuất dùng", "L1", "01/01/2027", "", 4, 6, "", "Khoa Nội", "", ""]);
    const print = buildCardPrintHtml(item, rows.map((r, i) => ({ ...r, balance: [10, 6][i] })), (t) => t);
    expect(print).toContain("THẺ KHO");
    expect(print).toContain("Thuốc &lt;A&gt;");
  });
  it("sổ, báo cáo, mẫu nhập: tiêu đề cột đủ; rỗng vẫn hợp lệ", () => {
    expect(buildLedgerSheets([], "2026-01-01", "2026-11-26")[0].emptyText).toContain("Không có phiếu nào");
    expect(buildReportSheets([], "2026-11-01", "2026-11-26")[0].headers).toHaveLength(11);
    expect(buildImportTemplateSheets(["Mã vật tư *"])[0].headers).toEqual(["Mã vật tư *"]);
  });
  it("ghi ra .xlsx thật và đọc lại được: nhiều trang tính, số vẫn là số, chữ tiếng Việt nguyên vẹn, tiêu đề ở dòng 1", async () => {
    const sheets = buildStockSheets([item], [{ lot_id: "l1", item_id: "i1", lot_number: "L1", expiry_date: "2026-12-30", balance: 3.5 }], "2026-11-26");
    const buf = await sheetsToXlsx(sheets);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // xlsx là file zip, không phải HTML/CSV
    expect(buf.toString("utf8", 0, 200)).not.toContain("<html");
    const first = await readSheet(buf, "Tồn theo vật tư");
    expect(first[0][0]).toBe("Tồn kho hóa chất & VTYT xét nghiệm — tại ngày 26/11/2026");
    expect(first[1].slice(0, 4)).toEqual(["STT", "Mã VT", "Mã vạch", "Tên vật tư"]);
    expect(first[2].slice(0, 9)).toEqual([1, "HC001", "893", "Thuốc <A>", "Hóa chất / thuốc thử", "Hộp", 3.5, 5, "Sắp hết"]);
    expect(typeof first[2][6]).toBe("number");
    const second = await readSheet(buf, "Tồn theo lô");
    expect(second[1][0]).toBe("STT");
    expect(second[2][3]).toBe("L1");
    expect(second[2][7]).toBe(3.5);
  });
  it("trang tính rỗng vẫn ra file hợp lệ có dòng thông báo", async () => {
    const buf = await sheetsToXlsx(buildLedgerSheets([], "2026-01-01", "2026-11-26"));
    const rows = await readSheet(buf);
    expect(rows[2][0]).toBe("Không có phiếu nào trong khoảng ngày này.");
  });
  it("tên file .xlsx an toàn; content-type đúng chuẩn", () => {
    expect(xlsxFileName("the-kho_HC 001/a")).toBe("the-kho_HC_001_a.xlsx");
    expect(XLSX_CONTENT_TYPE).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
  it("không còn xuất CSV hay bảng HTML đặt đuôi .xls ở các route xuất của kho", () => {
    for (const f of ["export/route.ts", "items/[id]/card/route.ts", "items/import/route.ts", "report/route.ts"]) {
      const src = read(`src/app/api/lab-supplies/${f}`);
      expect(src, f).not.toMatch(/text\/csv|vnd\.ms-excel|\.xls"|\.csv"/);
      expect(src, f).toContain("XLSX_CONTENT_TYPE");
    }
    expect(read("src/components/lab-supplies-ledger.tsx")).toContain("format=xlsx");
    expect(read("src/components/lab-supplies-item-card.tsx")).toContain("format=xlsx");
  });
});

describe("phiếu nhiều dòng và quyền: cấu trúc nhất quán UI → API → DB", () => {
  const api = read("src/app/api/lab-supplies/movements/batch/route.ts");
  const mig = read("supabase/migrations/20261202000001_lab_supplies_batch_v1.sql");
  const access = read("supabase/migrations/20261202000002_lab_supplies_restrict_access_v1.sql");
  const dlg = read("src/components/lab-supplies-voucher.tsx");
  it("API ghi cần lab_supplies.manage, chạy MỘT lệnh RPC cho cả phiếu, báo dòng lỗi", () => {
    expect(api).toContain('labSuppliesContext("lab_supplies.manage")');
    expect(api).toContain("qlcl_lab_supply_batch_receive_v1");
    expect(api).toContain("qlcl_lab_supply_batch_issue_v1");
    expect(api).toContain("Một phiếu tối đa");
    expect(api).toContain("Dòng ${i + 1}");
  });
  it("hàm DB lặp qua hàm 1 dòng, ném lỗi kèm 'Dòng N' để hoàn tác cả phiếu, chỉ service_role gọi được", () => {
    expect(mig).toContain("public.qlcl_lab_supply_receive_v1(");
    expect(mig).toContain("public.qlcl_lab_supply_post_movement_v1(");
    expect(mig).toContain("raise exception 'Dòng %: %', v_idx, sqlerrm");
    expect(mig).toContain("grant execute on function public.qlcl_lab_supply_batch_receive_v1");
    expect(mig).toMatch(/revoke execute on function public\.qlcl_lab_supply_batch_issue_v1\(.*\) from public, anon, authenticated/);
    expect(mig).not.toMatch(/\bdrop table\b|\bdelete from\b|\balter table\b/i);
  });
  it("form gửi đúng trường mà API xử lý (nhập: item_id/lot_number/expiry_date/quantity; xuất/hủy: lot_id/quantity)", () => {
    expect(dlg).toContain("item_id: v.item!.id, lot_number: l.lot_number.trim(), expiry_date: l.expiry_date, quantity: l.quantity");
    expect(dlg).toContain("v.allocations.map((a) => ({ lot_id: a.lot_id, quantity: String(a.quantity) }))");
    expect(dlg).toContain('"/api/lab-supplies/movements/batch"');
  });
  it("giới hạn quyền xem: gỡ lab_supplies.* khỏi mọi vai trò trừ ADMIN/SYSTEM_ADMIN, không gắn cứng tài khoản", () => {
    expect(access).toContain("r.code not in ('ADMIN', 'SYSTEM_ADMIN')");
    expect(access).toContain("'lab_supplies.view', 'lab_supplies.manage'");
    const sqlOnly = access.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"); // bỏ chú thích
    expect(sqlOnly).not.toMatch(/@|qlcl01|email/i);
  });
  it("nhập Excel: xem trước không ghi, chỉ commit mới ghi; xuất/thẻ kho chỉ cần quyền xem", () => {
    const imp = read("src/app/api/lab-supplies/items/import/route.ts");
    expect(imp).toContain('mode !== "commit") return NextResponse.json({ ok: true, mode: "preview"');
    expect(imp).toContain('labSuppliesContext("lab_supplies.manage")');
    expect(read("src/app/api/lab-supplies/export/route.ts")).toContain('labSuppliesContext("lab_supplies.view")');
    expect(read("src/app/api/lab-supplies/items/[id]/card/route.ts")).toContain('labSuppliesContext("lab_supplies.view")');
  });
});
