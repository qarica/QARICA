import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { normalizeInternalAuditType } from "@/lib/internal-audit-types";
import { createAdminClient } from "@/lib/supabase/admin";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const auditType = normalizeInternalAuditType(searchParams.get("audit_type"));

  let query = admin
    .from("hsba_audits")
    .select("id,department_id,record_reference,period,audited_by,audited_at,overall_result,status,audit_type,checklist_version_id")
    .eq("organization_id", organizationId)
    .eq("audit_type", auditType)
    .order("audited_at", { ascending: false })
    .limit(200);
  if (period && PERIOD_RE.test(period)) query = query.eq("period", period);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, audits: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const departmentId = String(body.department_id || "").trim();
  const recordReference = String(body.record_reference || "").trim();
  const period = String(body.period || "").trim();
  const auditType = normalizeInternalAuditType(body.audit_type);
  const checklistVersionId = String(body.checklist_version_id || "").trim();
  const results: Array<{ checklist_item_id?: string; result?: string; note?: string }> = Array.isArray(body.results) ? body.results : [];

  if (!departmentId) return NextResponse.json({ error: "Chưa chọn khoa/phòng." }, { status: 400 });
  if (!recordReference) return NextResponse.json({ error: "Chưa nhập mã/số hồ sơ." }, { status: 400 });
  if (!PERIOD_RE.test(period)) return NextResponse.json({ error: "Kỳ báo cáo không hợp lệ (định dạng YYYY-MM)." }, { status: 400 });
  if (!checklistVersionId) return NextResponse.json({ error: "Chưa chọn mẫu bảng kiểm." }, { status: 400 });
  if (!results.length) return NextResponse.json({ error: "Chưa chấm tiêu chí nào." }, { status: 400 });

  const { data: version } = await admin
    .from("hsba_checklist_versions")
    .select("id,status,hsba_checklist_templates!inner(id,organization_id,audit_type)")
    .eq("id", checklistVersionId)
    .maybeSingle();
  const versionTemplate = version ? (version as any).hsba_checklist_templates : null;
  if (!version || !versionTemplate || versionTemplate.organization_id !== organizationId || versionTemplate.audit_type !== auditType) {
    return NextResponse.json({ error: "Mẫu bảng kiểm không hợp lệ." }, { status: 400 });
  }
  if (version.status !== "PUBLISHED") return NextResponse.json({ error: "Chỉ được dùng phiên bản bảng kiểm đã phát hành." }, { status: 409 });

  const itemIds = results.map((r: any) => String(r.checklist_item_id || "")).filter(Boolean);
  const { data: items, error: itemsError } = await admin
    .from("hsba_checklist_items")
    .select("id,content")
    .eq("checklist_version_id", checklistVersionId)
    .in("id", itemIds);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 400 });
  const itemContentById = new Map((items ?? []).map((i: any) => [i.id, i.content]));

  // HSBA tiếp tục chỉ chấp nhận PASS/FAIL như cũ ("Bảng kiểm thường quy Hồ sơ
  // bệnh án chưa đụng") — Phác đồ điều trị và QTKT nội trú là kiểm bổ sung,
  // được chấm thêm PARTIAL (Đạt 1 phần)/NA (Không áp dụng), theo yêu cầu
  // tường minh của người dùng. Cột result/overall_result đã được nới check
  // constraint tương ứng (xem migration 20261027_hsba_audit_partial_na_result_v1.sql).
  const EXTRA_RESULTS = new Set(["PASS", "FAIL", "PARTIAL", "NA"]);
  const normalizedResults = results
    .filter((r: any) => itemContentById.has(r.checklist_item_id))
    .map((r: any) => ({
      checklist_item_id: r.checklist_item_id,
      result: auditType === "HSBA" ? (r.result === "FAIL" ? "FAIL" : "PASS") : (EXTRA_RESULTS.has(r.result) ? r.result : "PASS"),
      note: r.note ? String(r.note).trim() || null : null,
    }));
  if (!normalizedResults.length) return NextResponse.json({ error: "Không có tiêu chí hợp lệ để lưu." }, { status: 400 });

  // Tổng hợp: FAIL nếu có bất kỳ tiêu chí FAIL, PARTIAL nếu không có FAIL
  // nhưng có tiêu chí PARTIAL, còn lại PASS — HSBA không bao giờ tạo ra
  // PARTIAL nên công thức này cho HSBA kết quả y hệt trước đây.
  const overallResult = normalizedResults.some((r) => r.result === "FAIL") ? "FAIL" : normalizedResults.some((r) => r.result === "PARTIAL") ? "PARTIAL" : "PASS";

  const { data: audit, error: auditError } = await admin
    .from("hsba_audits")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      record_reference: recordReference,
      period,
      audited_by: auth.user.id,
      overall_result: overallResult,
      status: "OPEN",
      audit_type: auditType,
      checklist_version_id: checklistVersionId,
    })
    .select("id,department_id,record_reference,period,audited_by,audited_at,overall_result,status,audit_type,checklist_version_id")
    .single();
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 400 });

  const { data: itemResults, error: itemResultsError } = await admin
    .from("hsba_audit_item_results")
    .insert(normalizedResults.map((r) => ({ audit_id: audit.id, ...r })))
    .select("id,checklist_item_id,result,note");
  if (itemResultsError) return NextResponse.json({ error: itemResultsError.message }, { status: 400 });

  // Explicit business rule: chỉ bảng kiểm HSBA mới trả lỗi về khoa xử lý.
  // Phác đồ điều trị và QTKT nội trú là kiểm bổ sung không bắt buộc, không
  // tạo "lỗi" gửi khoa — kết quả Không đạt của 2 loại này chỉ nằm trong
  // hsba_audit_item_results để tính vào báo cáo tháng, không có vòng đời
  // finding/SEND nào cả.
  const failedResults = (itemResults ?? []).filter((r: any) => r.result === "FAIL");
  if (auditType === "HSBA" && failedResults.length) {
    const findingsPayload = failedResults.map((r: any) => ({
      organization_id: organizationId,
      audit_id: audit.id,
      item_result_id: r.id,
      department_id: departmentId,
      description: `${itemContentById.get(r.checklist_item_id) || "Tiêu chí"}${r.note ? ` — ${r.note}` : ""}`,
      status: "OPEN",
      audit_type: auditType,
    }));
    const { error: findingsError } = await admin.from("hsba_audit_findings").insert(findingsPayload);
    if (findingsError) return NextResponse.json({ error: findingsError.message }, { status: 400 });
  }

  const { error: auditLogError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "hsba_audits",
    row_id: audit.id,
    action_type: "HSBA_AUDIT_CREATE",
    new_value: { audit_type: auditType, department_id: departmentId, record_reference: recordReference, period, overall_result: overallResult, item_count: normalizedResults.length, findings_created: auditType === "HSBA" ? failedResults.length : 0 },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditLogError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditLogError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, audit, results: itemResults, failed_count: failedResults.length, findings_created: auditType === "HSBA" ? failedResults.length : 0 });
}
