import { NextResponse } from "next/server";
import { CATEGORY_LABEL, KIND_CATEGORIES, fmtDateFile, isIsoDate, parseSupplyKind, todayInVietnam } from "@/lib/lab-supplies";
import { buildLedgerSheets, buildReplenishmentSheets, buildStockSheets, type ExportItem, type ExportLot, type ExportMovement } from "@/lib/lab-supplies-export";
import { XLSX_CONTENT_TYPE, sheetsToXlsx, xlsxFileName } from "@/lib/lab-supplies-xlsx";
import { ITEM_SELECT, LOT_BALANCE_SELECT, MOVEMENT_SELECT, labSuppliesContext } from "@/lib/lab-supplies-api";
import { fetchAllPages } from "@/lib/lab-supplies-paging";

const MAX_LEDGER_ROWS = 20000;

// Xuất Excel (.xlsx thật) kho: ?type=stock (tồn hiện tại, theo vật tư + theo lô) | ?type=replenish (cần bổ sung/đặt hàng) | ?type=ledger&from=&to= (sổ xuất nhập).
// Chỉ đọc => lab_supplies.view; dữ liệu luôn lọc theo tổ chức của người gọi.
export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const kind = parseSupplyKind(params.get("kind"));
  const kindSuffix = kind === "chemical" ? "-hoa-chat" : kind === "supply" ? "-vat-tu" : "";
  const noun = kind === "supply" ? "vật tư xét nghiệm" : kind === "chemical" ? "hóa chất xét nghiệm" : "hóa chất & VTYT xét nghiệm";
  const today = todayInVietnam();
  const send = async (sheets: Parameters<typeof sheetsToXlsx>[0], base: string) =>
    new NextResponse(new Uint8Array(await sheetsToXlsx(sheets)), { headers: { "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": `attachment; filename="${xlsxFileName(base)}"`, "Cache-Control": "no-store" } });

  if (type === "stock" || type === "replenish") {
    const [itemsRes, lotsRes] = await Promise.all([
      fetchAllPages((from, to) => ctx.admin.from("lab_supply_items").select(ITEM_SELECT).eq("organization_id", ctx.organizationId).in("category", kind ? KIND_CATEGORIES[kind] : Object.keys(CATEGORY_LABEL)).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
      fetchAllPages((from, to) => ctx.admin.from("lab_supply_lot_balances").select(LOT_BALANCE_SELECT).eq("organization_id", ctx.organizationId).gt("balance", 0).order("lot_id", { ascending: true }).range(from, to)),
    ]);
    const err = itemsRes.error || lotsRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 400 });
    const exportItems = (itemsRes.data ?? []) as unknown as ExportItem[];
    const itemIds = new Set(exportItems.map((i) => i.id));
    const exportLots = ((lotsRes.data ?? []) as unknown as ExportLot[]).filter((l) => itemIds.has(l.item_id));
    const sheets = type === "stock" ? buildStockSheets(exportItems, exportLots, today, noun) : buildReplenishmentSheets(exportItems, exportLots, today);
    const stockBase = kind === "supply" ? "ton-kho-vat-tu" : "ton-kho-hoa-chat";
    const replenishBase = kind === "supply" ? "can-bo-sung-vat-tu" : "can-bo-sung-hoa-chat";
    return send(sheets, `${type === "stock" ? stockBase : replenishBase}_${fmtDateFile(today)}`);
  }

  if (type === "ledger") {
    const to = params.get("to") || today;
    const from = params.get("from") || `${to.slice(0, 4)}-01-01`;
    if (!isIsoDate(from) || !isIsoDate(to)) return NextResponse.json({ error: "Khoảng ngày không hợp lệ." }, { status: 400 });
    if (from > to) return NextResponse.json({ error: "Từ ngày phải trước hoặc bằng đến ngày." }, { status: 400 });
    const { data, error } = await fetchAllPages((a, b) => ctx.admin
      .from("lab_supply_movements")
      .select(MOVEMENT_SELECT)
      .eq("organization_id", ctx.organizationId)
      .gte("movement_date", from)
      .lte("movement_date", to)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(a, b), MAX_LEDGER_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    let ledgerRows = (data ?? []) as unknown as ExportMovement[];
    if (kind) {
      const kindItems = await fetchAllPages((a, b) => ctx.admin.from("lab_supply_items").select("id").eq("organization_id", ctx.organizationId).in("category", KIND_CATEGORIES[kind]).order("id", { ascending: true }).range(a, b));
      if (kindItems.error) return NextResponse.json({ error: kindItems.error.message }, { status: 400 });
      const ids = new Set((kindItems.data ?? []).map((i: any) => i.id));
      ledgerRows = ledgerRows.filter((m: any) => ids.has(m.item_id));
    }
    return send(buildLedgerSheets(ledgerRows, from, to, noun), `so-xuat-nhap${kindSuffix}_${fmtDateFile(from)}_${fmtDateFile(to)}`);
  }

  return NextResponse.json({ error: "Loại xuất không hợp lệ (stock, replenish hoặc ledger)." }, { status: 400 });
}
