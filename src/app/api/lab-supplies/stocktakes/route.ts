import { NextResponse } from "next/server";
import { clean, cleanOrNull, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

const QUANTITY_RE = /^\d+(\.\d{1,3})?$/;

export async function GET() {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const { data, error } = await ctx.admin
    .from("lab_supply_stocktakes")
    .select("id,stocktake_date,note,created_by,created_at")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, stocktakes: data ?? [] });
}

// Phiếu kiểm kê: body { note?, lines: [{ lot_id, counted_quantity }] }.
// Chênh lệch giữa số đếm thực tế và tồn sổ tự sinh dòng ADJUST (lý do STOCKTAKE)
// trong cùng một giao dịch DB — không ghi đè số liệu cũ.
export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown; lines?: unknown };

  if (!Array.isArray(body.lines) || body.lines.length === 0) return NextResponse.json({ error: "Phiếu kiểm kê chưa có dòng nào." }, { status: 400 });
  if (body.lines.length > 500) return NextResponse.json({ error: "Mỗi phiếu kiểm kê tối đa 500 lô." }, { status: 400 });

  const lines: { lot_id: string; counted_quantity: number }[] = [];
  const seen = new Set<string>();
  for (const raw of body.lines as Record<string, unknown>[]) {
    const lotId = clean(raw?.lot_id);
    const counted = clean(raw?.counted_quantity).replace(",", ".");
    if (!lotId) return NextResponse.json({ error: "Có dòng kiểm kê thiếu lô." }, { status: 400 });
    if (!QUANTITY_RE.test(counted)) return NextResponse.json({ error: "Số đếm thực tế phải là số không âm (tối đa 3 chữ số thập phân)." }, { status: 400 });
    if (seen.has(lotId)) return NextResponse.json({ error: "Một lô không được xuất hiện 2 lần trong phiếu kiểm kê." }, { status: 400 });
    seen.add(lotId);
    lines.push({ lot_id: lotId, counted_quantity: Number(counted) });
  }

  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_stocktake_v1", {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_note: cleanOrNull(body.note),
    p_lines: lines,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_stocktakes", (data as { stocktake_id?: string })?.stocktake_id ?? null, "LAB_SUPPLY_STOCKTAKE", { lines: lines.length, result: data }, "Kiểm kê kho hóa chất/VTYT xét nghiệm.");
  return NextResponse.json({ ok: true, result: data });
}
