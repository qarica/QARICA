import { NextResponse } from "next/server";
import { CATEGORIES, type SupplyCategory } from "@/lib/lab-supplies";
import { fetchAllPages } from "@/lib/lab-supplies-paging";
import { ITEM_SELECT, clean, cleanOrNull, labSuppliesContext, parseBarcode, writeAudit } from "@/lib/lab-supplies-api";

const CATEGORY_SET = new Set<string>(CATEGORIES);

function parseThresholds(body: Record<string, unknown>) {
  const minRaw = clean(body.min_stock).replace(",", ".");
  const minStock = minRaw === "" ? 0 : Number(minRaw);
  if (!Number.isFinite(minStock) || minStock < 0) return { error: "Định mức tồn tối thiểu phải là số không âm." };
  const warnRaw = clean(body.expiry_warning_days);
  const warnDays = warnRaw === "" ? 30 : Number(warnRaw);
  if (!Number.isInteger(warnDays) || warnDays < 0 || warnDays > 3650) return { error: "Số ngày cảnh báo hết hạn phải là số nguyên từ 0 đến 3650." };
  return { minStock, warnDays };
}

export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const showInactive = new URL(request.url).searchParams.get("inactive") === "1";
  const { data, error } = await fetchAllPages((from, to) => {
    let query = ctx.admin.from("lab_supply_items").select(ITEM_SELECT).eq("organization_id", ctx.organizationId).order("code", { ascending: true }).order("id", { ascending: true });
    if (!showInactive) query = query.eq("is_active", true);
    return query.range(from, to);
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const code = clean(body.code).toUpperCase();
  const name = clean(body.name);
  const unit = clean(body.unit);
  const category = clean(body.category) || "REAGENT";
  if (!code || code.length > 40) return NextResponse.json({ error: "Mã vật tư là bắt buộc (tối đa 40 ký tự)." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Tên vật tư là bắt buộc." }, { status: 400 });
  if (!unit) return NextResponse.json({ error: "Đơn vị tính là bắt buộc." }, { status: 400 });
  if (!CATEGORY_SET.has(category)) return NextResponse.json({ error: "Nhóm vật tư không hợp lệ." }, { status: 400 });
  const barcode = parseBarcode(body.barcode);
  if ("error" in barcode) return NextResponse.json({ error: barcode.error }, { status: 400 });
  const thresholds = parseThresholds(body);
  if ("error" in thresholds) return NextResponse.json({ error: thresholds.error }, { status: 400 });

  const { data, error } = await ctx.admin
    .from("lab_supply_items")
    .insert({
      organization_id: ctx.organizationId,
      code,
      barcode: barcode.value,
      name,
      category: category as SupplyCategory,
      unit,
      manufacturer: cleanOrNull(body.manufacturer),
      storage_condition: cleanOrNull(body.storage_condition),
      min_stock: thresholds.minStock,
      expiry_warning_days: thresholds.warnDays,
      notes: cleanOrNull(body.notes),
      created_by: ctx.userId,
    })
    .select(ITEM_SELECT)
    .single();
  if (error) {
    const duplicate = error.code === "23505";
    const barcodeDup = duplicate && /barcode/i.test(`${error.message} ${error.details ?? ""}`);
    const message = barcodeDup ? `Mã vạch ${barcode.value} đã gắn cho vật tư khác.` : duplicate ? `Mã vật tư ${code} đã tồn tại.` : error.message;
    return NextResponse.json({ error: message }, { status: duplicate ? 409 : 400 });
  }

  await writeAudit(ctx.admin, ctx.userId, "lab_supply_items", data.id, "LAB_SUPPLY_ITEM_CREATE", data, "Thêm vật tư vào kho hóa chất/VTYT xét nghiệm.");
  return NextResponse.json({ ok: true, item: data });
}
