import { NextResponse } from "next/server";
import { buildCardExcel, runningBalances, type ExportMovement } from "@/lib/lab-supplies-export";
import { ITEM_SELECT, MOVEMENT_SELECT, labSuppliesContext } from "@/lib/lab-supplies-api";

const MAX_ROWS = 5000;

// Thẻ kho của 1 vật tư: toàn bộ phiếu theo thời gian TĂNG dần kèm tồn lũy kế (tính từ sổ, không lưu).
// Chỉ đọc => lab_supplies.view. ?format=xls tải về Excel.
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

  if (new URL(request.url).searchParams.get("format") === "xls") {
    const safe = String(item.code).replace(/[^A-Za-z0-9._-]+/g, "_");
    return new NextResponse(buildCardExcel(item, movements), {
      headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="the-kho_${safe}.xls"`, "Cache-Control": "no-store" },
    });
  }
  const balances = runningBalances(movements.map((m) => m.quantity_delta));
  return NextResponse.json({ ok: true, item, truncated, rows: movements.map((m, i) => ({ ...m, balance: balances[i] })) });
}
