import { NextResponse } from "next/server";
import { DISPOSAL_REASON_LABEL, isIsoDate, parsePositiveQuantity, todayInVietnam } from "@/lib/lab-supplies";
import { clean, cleanOrNull, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

const MAX_LINES = 100;

// Phiếu NHIỀU DÒNG (nhập / xuất dùng / hủy hàng) ghi trong MỘT giao dịch DB: một dòng lỗi => cả phiếu hoàn tác
// (sổ bất biến nên không được để lại nửa phiếu). Mỗi dòng vẫn đi qua đúng hàm 1 dòng nên mọi ràng buộc giữ nguyên.
// Ranh giới quyền như route 1 dòng: ghi = lab_supplies.manage.
export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const type = clean(body.movement_type);
  if (!["RECEIPT", "ISSUE", "DISPOSAL"].includes(type)) return NextResponse.json({ error: "Loại phiếu không hợp lệ." }, { status: 400 });
  const movementDate = clean(body.movement_date) || todayInVietnam();
  if (!isIsoDate(movementDate)) return NextResponse.json({ error: "Ngày phiếu không hợp lệ." }, { status: 400 });
  if (movementDate > todayInVietnam()) return NextResponse.json({ error: "Ngày phiếu không được ở tương lai." }, { status: 400 });

  const rawLines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  if (!rawLines.length) return NextResponse.json({ error: "Phiếu chưa có dòng nào." }, { status: 400 });
  if (rawLines.length > MAX_LINES) return NextResponse.json({ error: `Một phiếu tối đa ${MAX_LINES} dòng.` }, { status: 400 });

  const referenceNo = cleanOrNull(body.reference_no);
  const counterparty = cleanOrNull(body.counterparty);
  const note = cleanOrNull(body.note);

  if (type === "RECEIPT") {
    const lines: Record<string, unknown>[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i] || {};
      const quantity = parsePositiveQuantity(l.quantity);
      if (!clean(l.item_id)) return NextResponse.json({ error: `Dòng ${i + 1}: chưa chọn vật tư.` }, { status: 400 });
      if (!clean(l.lot_number)) return NextResponse.json({ error: `Dòng ${i + 1}: số lô là bắt buộc.` }, { status: 400 });
      if (quantity === null) return NextResponse.json({ error: `Dòng ${i + 1}: số lượng phải là số lớn hơn 0 (tối đa 3 chữ số thập phân).` }, { status: 400 });
      const expiry = clean(l.expiry_date);
      if (expiry && !isIsoDate(expiry)) return NextResponse.json({ error: `Dòng ${i + 1}: hạn dùng không hợp lệ.` }, { status: 400 });
      lines.push({ item_id: clean(l.item_id), lot_number: clean(l.lot_number), expiry_date: expiry || null, quantity, note: cleanOrNull(l.note) });
    }
    const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_batch_receive_v1", {
      p_organization_id: ctx.organizationId,
      p_actor_user_id: ctx.userId,
      p_movement_date: movementDate,
      p_reference_no: referenceNo,
      p_counterparty: counterparty,
      p_note: note,
      p_lines: lines,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(ctx.admin, ctx.userId, "lab_supply_movements", null, "LAB_SUPPLY_BATCH_RECEIPT", { lines: lines.length, reference_no: referenceNo, counterparty, movement_date: movementDate }, "Nhập kho nhiều dòng.");
    return NextResponse.json({ ok: true, result: data });
  }

  // ISSUE / DISPOSAL: số lượng người dùng nhập là số dương, hàm DB đổi thành số âm trong sổ.
  let reasonCode: string | null = null;
  if (type === "DISPOSAL") {
    reasonCode = clean(body.reason_code);
    if (!Object.prototype.hasOwnProperty.call(DISPOSAL_REASON_LABEL, reasonCode)) return NextResponse.json({ error: "Vui lòng chọn lý do hủy hàng." }, { status: 400 });
    if ((note ?? "").length < 3) return NextResponse.json({ error: "Hủy hàng phải ghi chú lý do chi tiết." }, { status: 400 });
  } else if ((counterparty ?? "").length < 2) {
    return NextResponse.json({ error: "Xuất dùng phải ghi người nhận/nơi sử dụng." }, { status: 400 });
  }
  const lines: Record<string, unknown>[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i] || {};
    const quantity = parsePositiveQuantity(l.quantity);
    if (!clean(l.lot_id)) return NextResponse.json({ error: `Dòng ${i + 1}: chưa chọn lô.` }, { status: 400 });
    if (quantity === null) return NextResponse.json({ error: `Dòng ${i + 1}: số lượng phải là số lớn hơn 0 (tối đa 3 chữ số thập phân).` }, { status: 400 });
    lines.push({ lot_id: clean(l.lot_id), quantity, note: cleanOrNull(l.note) });
  }
  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_batch_issue_v1", {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_movement_type: type,
    p_movement_date: movementDate,
    p_reference_no: referenceNo,
    p_counterparty: counterparty,
    p_reason_code: reasonCode,
    p_note: note,
    p_lines: lines,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(ctx.admin, ctx.userId, "lab_supply_movements", null, `LAB_SUPPLY_BATCH_${type}`, { lines: lines.length, reference_no: referenceNo, counterparty, reason_code: reasonCode, movement_date: movementDate }, type === "ISSUE" ? "Xuất dùng nhiều dòng." : "Hủy hàng nhiều dòng.");
  return NextResponse.json({ ok: true, result: data });
}
