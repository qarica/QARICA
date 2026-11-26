import { NextResponse } from "next/server";
import { CATEGORY_LABEL, isIsoDate, todayInVietnam, type SupplyCategory } from "@/lib/lab-supplies";
import { labSuppliesContext } from "@/lib/lab-supplies-api";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

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
// ?format=csv xuất file (UTF-8 BOM) mở được bằng Excel.
export async function GET(request: Request) {
  const ctx = await labSuppliesContext("lab_supplies.view");
  if (!ctx.ok) return ctx.response;

  const params = new URL(request.url).searchParams;
  const today = todayInVietnam();
  const to = params.get("to") || today;
  const from = params.get("from") || `${to.slice(0, 8)}01`;
  if (!isIsoDate(from) || !isIsoDate(to)) return NextResponse.json({ error: "Khoảng ngày không hợp lệ." }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "Từ ngày phải trước hoặc bằng đến ngày." }, { status: 400 });

  const { data, error } = await ctx.admin.rpc("qlcl_lab_supply_period_report_v1", {
    p_organization_id: ctx.organizationId,
    p_from: from,
    p_to: to,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = ((data ?? []) as ReportRow[]).map((r) => ({
    ...r,
    min_stock: Number(r.min_stock),
    opening: Number(r.opening),
    receipts: Number(r.receipts),
    issues: Number(r.issues),
    disposals: Number(r.disposals),
    adjustments: Number(r.adjustments),
    closing: Number(r.closing),
  }));

  if (params.get("format") !== "csv") return NextResponse.json({ ok: true, from, to, rows });

  const headers = ["Mã VT", "Tên vật tư", "Nhóm", "ĐVT", "Tồn đầu kỳ", "Nhập trong kỳ", "Xuất dùng", "Hủy hàng", "Điều chỉnh (kiểm kê/hao hụt)", "Tồn cuối kỳ", "Định mức tối thiểu"];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    if (!r.is_active && [r.opening, r.receipts, r.issues, r.disposals, r.adjustments, r.closing].every((v) => v === 0)) continue;
    lines.push([r.code, r.name, CATEGORY_LABEL[r.category] ?? r.category, r.unit, r.opening, r.receipts, r.issues, r.disposals, r.adjustments, r.closing, r.min_stock].map(csvCell).join(","));
  }
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nhap-xuat-ton-xet-nghiem-${from}_${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
