import { NextResponse } from "next/server";
import { isIsoDate, todayInVietnam } from "@/lib/lab-supplies";
import { buildLedgerExcel, buildStockExcel, type ExportItem, type ExportLot, type ExportMovement } from "@/lib/lab-supplies-export";
import { ITEM_SELECT, LOT_BALANCE_SELECT, MOVEMENT_SELECT, labSuppliesContext } from "@/lib/lab-supplies-api";

const MAX_LEDGER_ROWS = 20000;

// Xuất Excel kho: ?type=stock (tồn hiện tại, theo vật tư + theo lô) | ?type=ledger&from=&to= (sổ xuất nhập).
// Chỉ đọc => lab_supplies.view; dữ liệu luôn lọc theo tổ chức của người gọi.
export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const today = todayInVietnam();
  const headers = (name: string) => ({ "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });

  if (type === "stock") {
    const [itemsRes, lotsRes] = await Promise.all([
      ctx.admin.from("lab_supply_items").select(ITEM_SELECT).eq("organization_id", ctx.organizationId).order("code", { ascending: true }),
      ctx.admin.from("lab_supply_lot_balances").select(LOT_BALANCE_SELECT).eq("organization_id", ctx.organizationId).gt("balance", 0).limit(5000),
    ]);
    const err = itemsRes.error || lotsRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 400 });
    return new NextResponse(buildStockExcel((itemsRes.data ?? []) as unknown as ExportItem[], (lotsRes.data ?? []) as unknown as ExportLot[], today), { headers: headers(`ton-kho-hoa-chat_${today}.xls`) });
  }

  if (type === "ledger") {
    const to = params.get("to") || today;
    const from = params.get("from") || `${to.slice(0, 4)}-01-01`;
    if (!isIsoDate(from) || !isIsoDate(to)) return NextResponse.json({ error: "Khoảng ngày không hợp lệ." }, { status: 400 });
    if (from > to) return NextResponse.json({ error: "Từ ngày phải trước hoặc bằng đến ngày." }, { status: 400 });
    const { data, error } = await ctx.admin
      .from("lab_supply_movements")
      .select(MOVEMENT_SELECT)
      .eq("organization_id", ctx.organizationId)
      .gte("movement_date", from)
      .lte("movement_date", to)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_LEDGER_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return new NextResponse(buildLedgerExcel((data ?? []) as unknown as ExportMovement[], from, to), { headers: headers(`so-xuat-nhap_${from}_${to}.xls`) });
  }

  return NextResponse.json({ error: "Loại xuất không hợp lệ (stock hoặc ledger)." }, { status: 400 });
}
