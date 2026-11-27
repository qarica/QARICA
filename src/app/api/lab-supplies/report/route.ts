import { NextResponse } from "next/server";
import { categoryInKind, fmtDateFile, isIsoDate, parseSupplyKind, todayInVietnam, type SupplyCategory } from "@/lib/lab-supplies";
import { buildReportSheets } from "@/lib/lab-supplies-export";
import { XLSX_CONTENT_TYPE, sheetsToXlsx, xlsxFileName } from "@/lib/lab-supplies-xlsx";
import { labSuppliesContext } from "@/lib/lab-supplies-api";
import { fetchAllPages } from "@/lib/lab-supplies-paging";

type ReportRow = {
  item_id: string;
  code: string;
  name: string;
  unit: string;
  category: SupplyCategory;
  is_active: boolean;
  min_stock: number;
  opening: number;
  receipts: number;
  issues: number;
  disposals: number;
  adjustments: number;
  closing: number;
};

// Báo cáo Nhập – Xuất – Tồn theo kỳ [from, to]. Tồn đầu kỳ = tổng sổ trước
// `from`; tồn cuối = tổng sổ đến hết `to`. Không có số tồn nhập tay nào.
// ?format=xlsx tải file Excel (.xlsx).
export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;

  const params = new URL(request.url).searchParams;
  const today = todayInVietnam();
  const kind = parseSupplyKind(params.get("kind"));
  const to = params.get("to") || today;
  const from = params.get("from") || `${to.slice(0, 8)}01`;
  if (!isIsoDate(from) || !isIsoDate(to)) return NextResponse.json({ error: "Khoảng ngày không hợp lệ." }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "Từ ngày phải trước hoặc bằng đến ngày." }, { status: 400 });

  const { data, error } = await fetchAllPages((a, b) => ctx.admin.rpc("qlcl_lab_supply_period_report_v1", {
    p_organization_id: ctx.organizationId,
    p_from: from,
    p_to: to,
  }).order("code", { ascending: true }).order("item_id", { ascending: true }).range(a, b));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = ((data ?? []) as ReportRow[]).filter((r) => categoryInKind(r.category, kind)).map((r) => ({
    ...r,
    min_stock: Number(r.min_stock),
    opening: Number(r.opening),
    receipts: Number(r.receipts),
    issues: Number(r.issues),
    disposals: Number(r.disposals),
    adjustments: Number(r.adjustments),
    closing: Number(r.closing),
  }));

  if (params.get("format") !== "xlsx") return NextResponse.json({ ok: true, from, to, rows });

  const live = rows.filter((r) => r.is_active || [r.opening, r.receipts, r.issues, r.disposals, r.adjustments, r.closing].some((v) => v !== 0));
  return new NextResponse(new Uint8Array(await sheetsToXlsx(buildReportSheets(live, from, to, kind === "supply" ? "vật tư xét nghiệm" : kind === "chemical" ? "hóa chất xét nghiệm" : undefined))), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${xlsxFileName(`nhap-xuat-ton-${kind === "supply" ? "vat-tu" : kind === "chemical" ? "hoa-chat" : "xet-nghiem"}_${fmtDateFile(from)}_${fmtDateFile(to)}`)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
