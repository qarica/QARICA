import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Module "Kho hóa chất & VTYT xét nghiệm" — yêu cầu tường minh: menu ĐỘC LẬP,
// không liên kết với các menu khác; nhập kho theo lô/hạn dùng, xuất dùng, tồn
// kho, cảnh báo sắp hết/sắp hết hạn, kiểm kê, hao hụt, hủy hàng, chốt kỳ.
const migration = read("supabase/migrations/20261129000000_lab_supplies_v1.sql");

describe("Migration kho hóa chất/VTYT xét nghiệm", () => {
  it("bật RLS theo organization_id cho mọi bảng và khai báo quyền view/manage riêng", () => {
    for (const table of ["lab_supply_items", "lab_supply_lots", "lab_supply_movements", "lab_supply_period_closings", "lab_supply_stocktakes", "lab_supply_stocktake_lines"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("'lab_supplies.view'");
    expect(migration).toContain("'lab_supplies.manage'");
  });

  it("độc lập: không có khóa ngoại tới khoa/phòng, TTBYT, mua sắm hay bệnh nhân", () => {
    expect(migration).not.toMatch(/references public\.(departments|medical_equipment|procurement\w*|patients?\w*)\b/);
  });

  it("số tồn không lưu thành cột — tồn lô là tổng sổ xuất nhập (một nguồn sự thật)", () => {
    expect(migration).toContain("create or replace view public.lab_supply_lot_balances");
    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("coalesce(sum(m.quantity_delta), 0)");
    expect(migration).not.toMatch(/\b(opening_stock|stock_quantity|current_stock|on_hand)\b/);
  });

  it("sổ xuất nhập, kiểm kê và chốt kỳ bất biến (trigger chặn sửa/xóa); lô không đổi số lô/hạn dùng", () => {
    expect(migration).toContain("lab_supply_movements_immutable");
    expect(migration).toContain("lab_supply_closings_immutable");
    expect(migration).toContain("lab_supply_stocktake_lines_immutable");
    expect(migration).toContain("Không được sửa số lô/hạn dùng của lô đã tạo.");
  });

  it("ràng buộc dấu số lượng theo loại phiếu và bắt buộc lý do khi hủy/điều chỉnh", () => {
    expect(migration).toContain("lab_supply_movements_sign_check");
    expect(migration).toContain("lab_supply_movements_reason_check");
    expect(migration).toContain("lab_supply_movements_note_check");
  });

  it("thao tác ghi đi qua RPC nguyên tử chỉ cấp cho service_role", () => {
    for (const fn of ["qlcl_lab_supply_receive_v1", "qlcl_lab_supply_post_movement_v1", "qlcl_lab_supply_stocktake_v1", "qlcl_lab_supply_close_period_v1", "qlcl_lab_supply_period_report_v1"]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
      expect(migration).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to service_role`));
    }
    expect(migration).toContain("for update");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("điều khiển an toàn: không xuất lô hết hạn, không để tồn âm, không ghi vào kỳ đã chốt", () => {
    expect(migration).toContain("không được xuất dùng; hãy lập phiếu hủy hàng");
    expect(migration).toContain("không đủ (hiện còn");
    expect(migration).toContain("thuộc kỳ đã chốt");
    expect(migration).toContain("bắt buộc có hạn dùng");
  });
});

describe("API /api/lab-supplies — ranh giới view/manage nhất quán, lọc theo tổ chức", () => {
  const readRoute = (p: string) => read(`src/app/api/lab-supplies/${p}`);
  const helper = read("src/lib/lab-supplies-api.ts");

  it("helper xác thực dùng đúng quyền và lấy tổ chức của người gọi (fail-closed)", () => {
    expect(helper).toContain("requireApiPermission(permission)");
    expect(helper).toContain("callerOrganizationId");
    expect(helper).toContain("Tài khoản chưa gắn tổ chức.");
  });

  it("đọc (GET) dùng lab_supplies.view; ghi (POST/PATCH) dùng lab_supplies.manage", () => {
    const expectations: [string, string, string][] = [
      ["items/route.ts", "export async function GET", "lab_supplies.view"],
      ["items/route.ts", "export async function POST", "lab_supplies.manage"],
      ["items/[id]/route.ts", "export async function PATCH", "lab_supplies.manage"],
      ["movements/route.ts", "export async function GET", "lab_supplies.view"],
      ["movements/route.ts", "export async function POST", "lab_supplies.manage"],
      ["stocktakes/route.ts", "export async function GET", "lab_supplies.view"],
      ["stocktakes/route.ts", "export async function POST", "lab_supplies.manage"],
      ["closings/route.ts", "export async function GET", "lab_supplies.view"],
      ["closings/route.ts", "export async function POST", "lab_supplies.manage"],
      ["report/route.ts", "export async function GET", "lab_supplies.view"],
    ];
    for (const [file, handler, permission] of expectations) {
      const source = readRoute(file);
      const start = source.indexOf(handler);
      expect(start, `${file} thiếu ${handler}`).toBeGreaterThanOrEqual(0);
      const nextHandler = source.indexOf("export async function", start + 10);
      const block = source.slice(start, nextHandler === -1 ? undefined : nextHandler);
      expect(block, `${file} ${handler}`).toContain(`labSuppliesContext("${permission}")`);
    }
  });

  it("mọi route ghi đều gọi RPC nguyên tử hoặc lọc organization_id, và ghi audit_logs", () => {
    expect(readRoute("movements/route.ts")).toContain("qlcl_lab_supply_receive_v1");
    expect(readRoute("movements/route.ts")).toContain("qlcl_lab_supply_post_movement_v1");
    expect(readRoute("stocktakes/route.ts")).toContain("qlcl_lab_supply_stocktake_v1");
    expect(readRoute("closings/route.ts")).toContain("qlcl_lab_supply_close_period_v1");
    expect(readRoute("items/[id]/route.ts")).toContain('.eq("organization_id", ctx.organizationId)');
    for (const file of ["items/route.ts", "items/[id]/route.ts", "movements/route.ts", "stocktakes/route.ts", "closings/route.ts"]) {
      expect(readRoute(file), file).toContain("writeAudit(");
    }
  });

  it("phiếu điều chỉnh tay không cho lý do STOCKTAKE (chỉ sinh từ phiếu kiểm kê) và mã vật tư không sửa được", () => {
    expect(readRoute("movements/route.ts")).toContain('new Set(["SHRINKAGE", "CORRECTION"])');
    expect(readRoute("items/[id]/route.ts")).not.toMatch(/patch\.code\b/);
  });

  it("báo cáo Nhập–Xuất–Tồn tính từ sổ qua RPC và có xuất CSV", () => {
    const report = readRoute("report/route.ts");
    expect(report).toContain("qlcl_lab_supply_period_report_v1");
    expect(report).toContain('params.get("format") !== "csv"');
  });
});

describe("Trang /lab-supplies, điều hướng độc lập và UI", () => {
  it("page.tsx chặn truy cập bằng lab_supplies.view trước khi tải dữ liệu, đọc tồn từ view", () => {
    const page = read("src/app/(app)/lab-supplies/page.tsx");
    expect(page).toContain('requirePermission(user, "lab_supplies.view")');
    expect(page).toContain("lab_supply_lot_balances");
    expect(page).toContain('.eq("organization_id", user.organizationId)');
  });

  it("navigation.ts có nhóm menu riêng, gắn đúng quyền xem, không trộn vào menu khác", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('id: "lab-supplies"');
    expect(nav).toContain('href: "/lab-supplies"');
    expect(nav).toContain('permission: "lab_supplies.view"');
    expect(nav.match(/href: "\/lab-supplies"/g)?.length).toBe(1);
  });

  const client = read("src/components/lab-supplies-client.tsx");
  // Giao diện được tách theo màn hình (tab); các kiểm tra cấu trúc quét chung trên tất cả file giao diện của kho.
  const UI_FILES = ["client", "voucher", "detail", "stock", "ledger", "stocktake", "catalog", "scanner", "import-dialog", "item-card"].map((n) => `src/components/lab-supplies-${n}.tsx`);
  const ui = UI_FILES.map((f) => read(f)).join("\n");

  it("đúng quy ước UI của repo: .table-wrap, .modal-head, .inline-check, không styled-jsx", () => {
    expect(ui).toContain('<div className="table-wrap">');
    expect(ui).toMatch(/className="modal-card[^"]*"[\s\S]{0,60}<div className="modal-head">/);
    expect(ui).toContain('className="inline-check"');
    expect(ui).not.toMatch(/<label>\s*<input type="checkbox"/);
    expect(ui).not.toContain("<style jsx");
    expect(client).toContain(".lab-supplies .ls-tabs");
  });

  it("nhất quán form → body → API: các trường phiếu nhập/xuất đều được gửi lên", () => {
    const voucher = read("src/components/lab-supplies-voucher.tsx");
    for (const field of ["movement_type", "movement_date", "reference_no", "counterparty", "note", "item_id", "lot_number", "expiry_date", "lot_id", "reason_code", "quantity"]) {
      expect(voucher, field).toContain(field);
    }
    const route = read("src/app/api/lab-supplies/movements/batch/route.ts");
    for (const field of ["reference_no", "counterparty", "reason_code", "movement_type", "movement_date", "note"]) {
      expect(route, field).toContain(`body.${field}`); // trường chung của phiếu
    }
    for (const field of ["lot_number", "expiry_date", "lot_id", "item_id", "quantity"]) {
      expect(route, field).toContain(`l.${field}`); // trường từng dòng
    }
  });

  it("lô đã hết hạn không được xuất dùng trên UI (khớp chặn ở RPC): tự phân bổ bỏ lô hết hạn, ô đổi lô cũng loại", () => {
    const voucher = read("src/components/lab-supplies-voucher.tsx");
    expect(voucher).toContain('lotExpiryStatus(x.expiry_date, item.expiry_warning_days, today) !== "EXPIRED"');
    expect(read("src/lib/lab-supplies.ts")).toContain('mode === "ISSUE" ? ordered.filter((l) => !isExpired(l))');
  });
});
