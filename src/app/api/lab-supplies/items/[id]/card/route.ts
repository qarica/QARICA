import { NextResponse } from "next/server";
import { buildCardSheets, runningBalances, type ExportMovement } from "@/lib/lab-supplies-export";
import { XLSX_CONTENT_TYPE, sheetsToXlsx, xlsxFileName } from "@/lib/lab-supplies-xlsx";
import { ITEM_SELECT, MOVEMENT_SELECT, labSuppliesContext } from "@/lib/lab-supplies-api";

const MAX_ROWS = 5000;

// Thẻ kho của 1 vật tư: toàn bộ phiếu theo thời gian TĂNG dần kèm tồn lũy kế (tính từ sổ, không lưu).
// Chỉ đọc => lab_supplies.view. ?format=xlsx tải về file Excel (.xlsx).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const { id } = await params;

  const { data: item } = await ctx.admin.from("lab_supply_items").select(ITEM_SELECT).eq("id", id).eq("organization_id", ctx.organizationId).maybeSingle();
  if (!item) return NextResponse.json({ error: "Không tìm thấy vật tư hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data, error } = await ctx.admin
    .from("lab_supply_movements")
    .select(MOVEMENT_SELECT)
    .eq("organization_id", ctx.organizationId)
    .eq("item_id", id)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS + 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const truncated = (data ?? []).length > MAX_ROWS;
  const movements = ((data ?? []).slice(0, MAX_ROWS) as unknown as ExportMovement[]);

  if (new URL(request.url).searchParams.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(await sheetsToXlsx(buildCardSheets(item, movements))), {
      headers: { "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": `attachment; filename="${xlsxFileName(`the-kho_${item.code}`)}"`, "Cache-Control": "no-store" },
    });
  }
  const balances = runningBalances(movements.map((m) => m.quantity_delta));
  return NextResponse.json({ ok: true, item, truncated, rows: movements.map((m, i) => ({ ...m, balance: balances[i] })) });
}
