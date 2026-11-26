import { NextResponse } from "next/server";
import { clean, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

// Mở lại kỳ đã chốt gần nhất (chốt nhầm ngày / còn phiếu chưa ghi). Bắt buộc có lý do; DB lưu vết bất biến
// (lab_supply_period_reopenings) và chỉ cho mở lại đúng kỳ gần nhất để các kỳ chốt luôn liền mạch.
export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = clean(body.reason);
  if (reason.length < 5) return NextResponse.json({ error: "Mở lại kỳ phải ghi lý do (ít nhất 5 ký tự)." }, { status: 400 });

  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_reopen_period_v1", {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_period_closings", null, "LAB_SUPPLY_REOPEN_PERIOD", { reopened_period_end: (data as { reopened_period_end?: string })?.reopened_period_end, reason }, "Mở lại kỳ đã chốt kho hóa chất/VTYT xét nghiệm.");
  return NextResponse.json({ ok: true, result: data });
}
