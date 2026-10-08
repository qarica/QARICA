import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { INTERNAL_AUDIT_TYPE_LABEL, normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { createAdminClient } from "@/lib/supabase/admin";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const RESULT_LABEL: Record<string, string> = { PASS: "Đạt", PARTIAL: "Đạt một phần", FAIL: "Không đạt", PENDING: "Chưa chấm" };

export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const auditType = normalizeInternalAuditType(searchParams.get("audit_type"));
  const period = searchParams.get("period");

  let query = admin
    .from("hsba_audits")
    .select("id,department_id,record_reference,period,audited_by,audited_at,overall_result,status")
    .eq("organization_id", organizationId)
    .eq("audit_type", auditType)
    .order("audited_at", { ascending: false });
  if (period && PERIOD_RE.test(period)) query = query.eq("period", period);

  const { data: audits, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const auditIds = (audits ?? []).map((a) => a.id);
  const departmentIds = Array.from(new Set((audits ?? []).map((a) => a.department_id)));
  const auditorIds = Array.from(new Set((audits ?? []).map((a) => a.audited_by)));

  const [departmentsRes, profilesRes, itemResultsRes] = await Promise.all([
    departmentIds.length ? admin.from("departments").select("id,name").in("id", departmentIds) : Promise.resolve({ data: [] as any[] }),
    auditorIds.length ? admin.from("profiles").select("user_id,full_name,email").in("user_id", auditorIds) : Promise.resolve({ data: [] as any[] }),
    auditIds.length ? admin.from("hsba_audit_item_results").select("audit_id,result").in("audit_id", auditIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  const departmentName = new Map((departmentsRes.data ?? []).map((d: any) => [d.id, d.name]));
  const auditorName = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id]));
  const passCountByAudit = new Map<string, number>();
  const partialCountByAudit = new Map<string, number>();
  const failCountByAudit = new Map<string, number>();
  for (const r of itemResultsRes.data ?? []) {
    // NA không tính vào Đạt/Đạt 1 phần/Không đạt — cùng quy ước loại NA khỏi
    // mẫu số đã dùng ở module Giám sát/Bảng kiểm chung.
    const target = r.result === "FAIL" ? failCountByAudit : r.result === "PARTIAL" ? partialCountByAudit : r.result === "PASS" ? passCountByAudit : null;
    if (target) target.set(r.audit_id, (target.get(r.audit_id) || 0) + 1);
  }

  const headers = ["Mã/số hồ sơ", "Khoa/phòng", "Kỳ báo cáo", "Người kiểm", "Ngày kiểm", "Số tiêu chí đạt", "Số tiêu chí đạt 1 phần", "Số tiêu chí không đạt", "Kết quả tổng", "Trạng thái"];
  const lines = [headers.map(csvCell).join(",")];
  for (const a of audits ?? []) {
    lines.push(
      [
        a.record_reference,
        departmentName.get(a.department_id) || "—",
        a.period,
        auditorName.get(a.audited_by) || a.audited_by,
        a.audited_at,
        passCountByAudit.get(a.id) || 0,
        partialCountByAudit.get(a.id) || 0,
        failCountByAudit.get(a.id) || 0,
        RESULT_LABEL[a.overall_result] || a.overall_result,
        a.status,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const bom = "﻿";
  const typeLabel = INTERNAL_AUDIT_TYPE_LABEL[auditType].normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
  const filenameSuffix = period && PERIOD_RE.test(period) ? period : "tat-ca-ky";
  return new NextResponse(bom + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ket-qua-kiem-${typeLabel}-${filenameSuffix}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
