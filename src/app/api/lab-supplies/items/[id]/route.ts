import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/lab-supplies";
import { ITEM_SELECT, clean, labSuppliesContext, parseBarcode, writeAudit } from "@/lib/lab-supplies-api";

const CATEGORY_SET = new Set<string>(CATEGORIES);
const has = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

// Mã vật tư (code) là định danh, không sửa sau khi tạo — nên không có trong PATCH.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const { id } = await params;

  const { data: existing } = await ctx.admin.from("lab_supply_items").select("id,organization_id").eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== ctx.organizationId) {
    return NextResponse.json({ error: "Không tìm thấy vật tư hoặc ngoài phạm vi truy cập." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (has(body, "name")) {
    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Tên vật tư không được để trống." }, { status: 400 });
    patch.name = name;
  }
  if (has(body, "unit")) {
    const unit = clean(body.unit);
    if (!unit) return NextResponse.json({ error: "Đơn vị tính không được để trống." }, { status: 400 });
    patch.unit = unit;
  }
  if (has(body, "category")) {
    const category = clean(body.category);
    if (!CATEGORY_SET.has(category)) return NextResponse.json({ error: "Nhóm vật tư không hợp lệ." }, { status: 400 });
    patch.category = category;
  }
  if (has(body, "barcode")) {
    const barcode = parseBarcode(body.barcode);
    if ("error" in barcode) return NextResponse.json({ error: barcode.error }, { status: 400 });
    patch.barcode = barcode.value;
  }
  if (has(body, "manufacturer")) patch.manufacturer = clean(body.manufacturer) || null;
  if (has(body, "storage_condition")) patch.storage_condition = clean(body.storage_condition) || null;
  if (has(body, "notes")) patch.notes = clean(body.notes) || null;
  if (has(body, "min_stock")) {
    const raw = clean(body.min_stock).replace(",", ".");
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Định mức tồn tối thiểu phải là số không âm." }, { status: 400 });
    patch.min_stock = n;
  }
  if (has(body, "expiry_warning_days")) {
    const raw = clean(body.expiry_warning_days);
    const n = raw === "" ? 30 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return NextResponse.json({ error: "Số ngày cảnh báo hết hạn phải là số nguyên từ 0 đến 3650." }, { status: 400 });
    patch.expiry_warning_days = n;
  }
  if (has(body, "is_active")) patch.is_active = body.is_active === true || body.is_active === "true";

  const { data, error } = await ctx.admin.from("lab_supply_items").update(patch).eq("id", id).eq("organization_id", ctx.organizationId).select(ITEM_SELECT).single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({ error: duplicate ? "Mã vạch này đã gắn cho vật tư khác." : error.message }, { status: duplicate ? 409 : 400 });
  }

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_items", id, "LAB_SUPPLY_ITEM_UPDATE", patch, "Cập nhật vật tư trong kho hóa chất/VTYT xét nghiệm.");
  return NextResponse.json({ ok: true, item: data });
}
