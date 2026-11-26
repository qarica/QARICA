import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns, foldHeader, parseCategory, parseItemRows } from "./lab-supplies-import";
import { buildCardExcel, buildImportTemplateExcel, buildLedgerExcel, buildStockExcel, escHtml, runningBalances } from "./lab-supplies-export";
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

describe("xuất Excel kho", () => {
  const item = { id: "i1", code: "HC001", barcode: "893", name: "Thuốc <A>", category: "REAGENT" as const, unit: "Hộp", manufacturer: null, storage_condition: null, min_stock: 5, expiry_warning_days: 30, is_active: true };
  it("escape HTML và có đủ 2 bảng tồn kho (theo vật tư + theo lô)", () => {
    const html = buildStockExcel([item], [{ lot_id: "l1", item_id: "i1", lot_number: "L1", expiry_date: "2026-12-30", balance: 3 }, { lot_id: "l2", item_id: "i1", lot_number: "L0", expiry_date: "2026-11-01", balance: 0 }], "2026-11-26");
    expect(escHtml("<&>")).toBe("&lt;&amp;&gt;");
    expect(html).toContain("Thuốc &lt;A&gt;");
    expect(html).toContain("Sắp hết"); // tồn 3 ≤ định mức 5
    expect(html).toContain("Chi tiết tồn theo lô");
    expect(html).not.toContain("<td>L0</td>"); // lô tồn 0 không liệt kê
    expect((html.match(/<table>/g) || []).length).toBe(2);
  });
  it("tồn lũy kế tính đúng, làm tròn 3 chữ số", () => {
    expect(runningBalances([10, "-3", -2, 0.1, 0.2])).toEqual([10, 7, 5, 5.1, 5.3]);
  });
  it("thẻ kho: cột Nhập/Xuất tách theo dấu, tồn lũy kế khớp", () => {
    const rows = [
      { movement_date: "2026-11-01", created_at: "", movement_type: "RECEIPT" as const, quantity_delta: 10, reference_no: "PN1", counterparty: "NCC", reason_code: null, note: null, lot: { lot_number: "L1", expiry_date: "2027-01-01" } },
      { movement_date: "2026-11-05", created_at: "", movement_type: "ISSUE" as const, quantity_delta: -4, reference_no: null, counterparty: "Khoa Nội", reason_code: null, note: null, lot: { lot_number: "L1", expiry_date: "2027-01-01" } },
    ];
    const html = buildCardExcel(item, rows);
    const trs = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]));
    expect(trs[1]).toEqual(["2026-11-01", "Nhập kho", "L1", "2027-01-01", "10", "", "10", "PN1", "NCC", "", ""]);
    expect(trs[2]).toEqual(["2026-11-05", "Xuất dùng", "L1", "2027-01-01", "", "4", "6", "", "Khoa Nội", "", ""]);
    const print = buildCardPrintHtml(item, rows.map((r, i) => ({ ...r, balance: [10, 6][i] })), (t) => t);
    expect(print).toContain("THẺ KHO");
    expect(print).toContain("Thuốc &lt;A&gt;");
  });
  it("sổ xuất nhập và file mẫu có tiêu đề; rỗng vẫn ra file hợp lệ", () => {
    expect(buildLedgerExcel([], "2026-01-01", "2026-11-26")).toContain("Không có phiếu nào");
    expect(buildImportTemplateExcel(["Mã vật tư *"])).toContain("<th>Mã vật tư *</th>");
  });
});

describe("phiếu nhiều dòng và quyền: cấu trúc nhất quán UI → API → DB", () => {
  const api = read("src/app/api/lab-supplies/movements/batch/route.ts");
  const mig = read("supabase/migrations/20261202000001_lab_supplies_batch_v1.sql");
  const access = read("supabase/migrations/20261202000002_lab_supplies_restrict_access_v1.sql");
  const dlg = read("src/components/lab-supplies-batch.tsx");
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
    expect(dlg).toContain("{ item_id: l.item_id, lot_number: l.lot_number, expiry_date: l.expiry_date, quantity: l.quantity }");
    expect(dlg).toContain("{ lot_id: l.lot_id, quantity: l.quantity }");
    expect(dlg).toContain('disabled={type === "ISSUE" && o.expired}');
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
