import { NextResponse } from "next/server";
import {
  ADJUST_REASON_LABEL,
  DISPOSAL_REASON_LABEL,
  isIsoDate,
  parsePositiveQuantity,
  parseSignedQuantity,
  signedDelta,
  todayInVietnam,
  type MovementType,
} from "@/lib/lab-supplies";
import { MOVEMENT_SELECT, clean, cleanOrNull, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

const MOVEMENT_TYPES = new Set<string>(["RECEIPT", "ISSUE", "DISPOSAL", "ADJUST"]);
// STOCKTAKE chỉ sinh ra từ phiếu kiểm kê (/api/lab-supplies/stocktakes), không nhập tay ở đây.
const MANUAL_ADJUST_REASONS = new Set(["SHRINKAGE", "CORRECTION"]);

export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 200, 1), 500);

  let query = ctx.admin
    .from("lab_supply_movements")
    .select(MOVEMENT_SELECT)
    .eq("organization_id", ctx.organizationId)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  const itemId = params.get("item_id");
  const type = params.get("type");
  const from = params.get("from");
  const to = params.get("to");
  if (itemId) query = query.eq("item_id", itemId);
  if (type && MOVEMENT_TYPES.has(type)) query = query.eq("movement_type", type);
  if (isIsoDate(from)) query = query.gte("movement_date", from);
  if (isIsoDate(to)) query = query.lte("movement_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, movements: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const type = clean(body.movement_type);
  if (!MOVEMENT_TYPES.has(type)) return NextResponse.json({ error: "Loại phiếu không hợp lệ." }, { status: 400 });
  const movementType = type as MovementType;

  const movementDate = clean(body.movement_date) || todayInVietnam();
  if (!isIsoDate(movementDate)) return NextResponse.json({ error: "Ngày phiếu không hợp lệ." }, { status: 400 });
  if (movementDate > todayInVietnam()) return NextResponse.json({ error: "Ngày phiếu không được ở tương lai." }, { status: 400 });

  if (movementType === "RECEIPT") {
    const quantity = parsePositiveQuantity(body.quantity);
    if (quantity === null) return NextResponse.json({ error: "Số lượng nhập phải là số lớn hơn 0 (tối đa 3 chữ số thập phân)." }, { status: 400 });
    const itemId = clean(body.item_id);
    if (!itemId) return NextResponse.json({ error: "Vui lòng chọn vật tư." }, { status: 400 });
    const lotNumber = clean(body.lot_number);
    if (!lotNumber) return NextResponse.json({ error: "Số lô là bắt buộc." }, { status: 400 });
    const expiry = clean(body.expiry_date);
    if (expiry && !isIsoDate(expiry)) return NextResponse.json({ error: "Hạn dùng không hợp lệ." }, { status: 400 });

    const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_receive_v1", {
      p_organization_id: ctx.organizationId,
      p_actor_user_id: ctx.userId,
      p_item_id: itemId,
      p_lot_number: lotNumber,
      p_expiry_date: expiry || null,
      p_quantity: quantity,
      p_movement_date: movementDate,
      p_reference_no: cleanOrNull(body.reference_no),
      p_counterparty: cleanOrNull(body.counterparty),
      p_note: cleanOrNull(body.note),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(ctx.admin, ctx.userId, "lab_supply_movements", (data as { movement_id?: string })?.movement_id ?? null, "LAB_SUPPLY_RECEIPT", { item_id: itemId, lot_number: lotNumber, expiry_date: expiry || null, quantity, movement_date: movementDate }, "Nhập kho hóa chất/VTYT xét nghiệm.");
    return NextResponse.json({ ok: true, result: data });
  }

  const lotId = clean(body.lot_id);
  if (!lotId) return NextResponse.json({ error: "Vui lòng chọn lô." }, { status: 400 });

  let quantity: number | null;
  let reasonCode: string | null = null;
  if (movementType === "ADJUST") {
    quantity = parseSignedQuantity(body.quantity);
    if (quantity === null) return NextResponse.json({ error: "Số lượng điều chỉnh phải khác 0 (có thể âm), tối đa 3 chữ số thập phân." }, { status: 400 });
    reasonCode = clean(body.reason_code);
    if (!MANUAL_ADJUST_REASONS.has(reasonCode)) {
      return NextResponse.json({ error: `Lý do điều chỉnh không hợp lệ (${Object.entries(ADJUST_REASON_LABEL).filter(([k]) => MANUAL_ADJUST_REASONS.has(k)).map(([, v]) => v).join(", ")}). Kiểm kê dùng phiếu kiểm kê riêng.` }, { status: 400 });
    }
  } else {
    quantity = parsePositiveQuantity(body.quantity);
    if (quantity === null) return NextResponse.json({ error: "Số lượng phải là số lớn hơn 0 (tối đa 3 chữ số thập phân)." }, { status: 400 });
    if (movementType === "DISPOSAL") {
      reasonCode = clean(body.reason_code);
      if (!Object.prototype.hasOwnProperty.call(DISPOSAL_REASON_LABEL, reasonCode)) return NextResponse.json({ error: "Vui lòng chọn lý do hủy hàng." }, { status: 400 });
    }
  }

  const note = cleanOrNull(body.note);
  if ((movementType === "DISPOSAL" || movementType === "ADJUST") && (note ?? "").length < 3) {
    return NextResponse.json({ error: "Hủy hàng/điều chỉnh phải ghi chú lý do chi tiết." }, { status: 400 });
  }
  const counterparty = cleanOrNull(body.counterparty);
  if (movementType === "ISSUE" && (counterparty ?? "").length < 2) {
    return NextResponse.json({ error: "Xuất dùng phải ghi người nhận/nơi sử dụng." }, { status: 400 });
  }

  const delta = signedDelta(movementType, quantity);
  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_post_movement_v1", {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_lot_id: lotId,
    p_movement_type: movementType,
    p_quantity_delta: delta,
    p_movement_date: movementDate,
    p_reference_no: cleanOrNull(body.reference_no),
    p_counterparty: counterparty,
    p_reason_code: reasonCode,
    p_note: note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_movements", (data as { movement_id?: string })?.movement_id ?? null, `LAB_SUPPLY_${movementType}`, { lot_id: lotId, quantity_delta: delta, reason_code: reasonCode, movement_date: movementDate }, `Phiếu kho hóa chất/VTYT xét nghiệm: ${movementType}.`);
  return NextResponse.json({ ok: true, result: data });
}
