import { NextResponse } from "next/server";
import { isIsoDate } from "@/lib/lab-supplies";
import { clean, cleanOrNull, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

export async function GET() {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const { data, error } = await ctx.admin
    .from("lab_supply_period_closings")
    .select("id,period_end,note,created_by,created_at")
    .eq("organization_id", ctx.organizationId)
    .order("period_end", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, closings: data ?? [] });
}

// Chốt kỳ đến ngày period_end: sau đó không ghi thêm phiếu có ngày <= period_end
// (hàm RPC kiểm tra nguyên tử). Chốt kỳ không xóa/sửa được.
export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const periodEnd = clean(body.period_end);
  if (!isIsoDate(periodEnd)) return NextResponse.json({ error: "Ngày chốt kỳ không hợp lệ." }, { status: 400 });

  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_close_period_v1", {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_period_end: periodEnd,
    p_note: cleanOrNull(body.note),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_period_closings", (data as { closing_id?: string })?.closing_id ?? null, "LAB_SUPPLY_CLOSE_PERIOD", { period_end: periodEnd }, "Chốt kỳ kho hóa chất/VTYT xét nghiệm.");
  return NextResponse.json({ ok: true, result: data });
}
