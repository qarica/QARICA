import { readSheet } from "read-excel-file/node";
import { NextResponse } from "next/server";
import { IMPORT_TEMPLATE_HEADERS, MAX_IMPORT_ROWS, parseItemRows } from "@/lib/lab-supplies-import";
import { buildImportTemplateSheets } from "@/lib/lab-supplies-export";
import { XLSX_CONTENT_TYPE, sheetsToXlsx } from "@/lib/lab-supplies-xlsx";
import { ITEM_SELECT, labSuppliesContext, writeAudit } from "@/lib/lab-supplies-api";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Tải file mẫu .xlsx (đọc => lab_supplies.view; không có dữ liệu thật). File mẫu mở bằng Excel, điền, lưu .xlsx rồi tải lên lại.
export async function GET() {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;
  const headers = IMPORT_TEMPLATE_HEADERS.map((h) => (h.required ? `${h.label} *` : h.label));
  return new NextResponse(new Uint8Array(await sheetsToXlsx(buildImportTemplateSheets(headers))), {
    headers: { "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": 'attachment; filename="mau-nhap-danh-muc-vat-tu.xlsx"', "Cache-Control": "no-store" },
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const delimiter = (text.split("\n")[0] || "").split(";").length > (text.split("\n")[0] || "").split(",").length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Thêm hàng loạt vật tư từ Excel (.xlsx) hoặc CSV. mode=preview: chỉ kiểm tra, KHÔNG ghi. mode=commit: ghi các dòng hợp lệ
// trong MỘT lệnh (tất cả hoặc không) — dòng lỗi bị bỏ qua và được báo lại. Ghi => lab_supplies.manage.
export async function POST(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.manage");
  if (!ctx.ok) return ctx.response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const mode = String(formData?.get("mode") || "preview");
  if (!(file instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "File đang trống." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa 5 MB." }, { status: 400 });

  let sheet: unknown[][];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (/\.csv$/i.test(file.name)) sheet = parseCsv(buffer.toString("utf8").replace(/^﻿/, ""));
    else sheet = (await readSheet(buffer)).map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)));
  } catch {
    return NextResponse.json({ error: "Không đọc được file. Hãy dùng file Excel (.xlsx) hoặc CSV theo mẫu." }, { status: 400 });
  }

  const [itemsRes] = await Promise.all([ctx.admin.from("lab_supply_items").select("code,barcode").eq("organization_id", ctx.organizationId)]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 400 });
  const existingCodes = new Set((itemsRes.data ?? []).map((i) => String(i.code).trim().toLowerCase()));
  const existingBarcodes = new Set((itemsRes.data ?? []).map((i) => String(i.barcode ?? "").trim().toLowerCase()).filter(Boolean));

  const { results, missing } = parseItemRows(sheet, existingCodes, existingBarcodes);
  if (missing.length) return NextResponse.json({ error: `Không tìm thấy dòng tiêu đề có các cột bắt buộc: ${missing.join(", ")}. Hãy dùng file mẫu.` }, { status: 400 });
  if (!results.length) return NextResponse.json({ error: "File không có dòng dữ liệu nào." }, { status: 400 });

  const valid = results.filter((r) => r.item);
  const summary = { total: results.length, valid: valid.length, invalid: results.length - valid.length, limit: MAX_IMPORT_ROWS };
  const preview = results.map((r) => ({ rowNumber: r.rowNumber, code: r.code, name: r.name, errors: r.errors }));
  if (mode !== "commit") return NextResponse.json({ ok: true, mode: "preview", summary, rows: preview });

  if (!valid.length) return NextResponse.json({ error: "Không có dòng hợp lệ để nhập.", summary, rows: preview }, { status: 400 });
  const { data, error } = await ctx.admin
    .from("lab_supply_items")
    .insert(valid.map((r) => ({ organization_id: ctx.organizationId, ...r.item, created_by: ctx.userId })))
    .select(ITEM_SELECT);
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({ error: duplicate ? "Có mã vật tư hoặc mã vạch bị trùng với dữ liệu vừa thêm ở nơi khác. Hãy tải lại file để xem trước." : error.message }, { status: duplicate ? 409 : 400 });
  }
  await writeAudit(ctx.admin, ctx.userId, "lab_supply_items", null, "LAB_SUPPLY_ITEM_IMPORT", { imported: (data ?? []).length, skipped: summary.invalid, file: file.name }, "Nhập danh mục vật tư từ file.");
  return NextResponse.json({ ok: true, mode: "commit", imported: (data ?? []).length, summary, rows: preview });
}
