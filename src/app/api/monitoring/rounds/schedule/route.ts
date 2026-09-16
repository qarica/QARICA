import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiPermission("monitoring.perform");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const versionId = String(body.version_id || "").trim();
  const scheduledDate = String(body.scheduled_date || "").trim();
  if (!versionId) return NextResponse.json({ error: "Thiếu phiên bản bảng kiểm." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: version }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("checklist_versions").select("id,checklist_template_id,version_no,status").eq("id", versionId).maybeSingle(),
  ]);
  if (!caller?.organization_id || !caller.is_active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  if (!version || version.status !== "PUBLISHED") return NextResponse.json({ error: "Chỉ được tạo đợt từ phiên bản đã phát hành." }, { status: 409 });

  const { data: template } = await admin.from("checklist_templates").select("id,code,name,owner_department_id,is_active").eq("id", version.checklist_template_id).maybeSingle();
  if (!template?.is_active || !template.owner_department_id) return NextResponse.json({ error: "Mẫu bảng kiểm không hợp lệ hoặc chưa có đơn vị quản lý." }, { status: 400 });
  const { data: ownerDepartment } = await admin.from("departments").select("organization_id").eq("id", template.owner_department_id).maybeSingle();
  if (!ownerDepartment || ownerDepartment.organization_id !== caller.organization_id) return NextResponse.json({ error: "Mẫu bảng kiểm không thuộc bệnh viện hiện tại." }, { status: 403 });

  const workYear = Number(scheduledDate.slice(0, 4));
  const { data: recordCode, error: codeError } = await admin.rpc("next_record_code", { p_org: caller.organization_id, p_record_type: "MONITORING", p_work_year: workYear });
  if (codeError || !recordCode) return NextResponse.json({ error: codeError?.message || "Không tạo được mã đợt giám sát." }, { status: 400 });

  const { data: record, error: recordError } = await admin.from("records").insert({
    organization_id: caller.organization_id,
    record_type: "MONITORING",
    record_code: recordCode,
    title: `${template.name} - ${scheduledDate}`,
    work_year: workYear,
    owner_department_id: template.owner_department_id,
    owner_user_id: auth.user.id,
    lifecycle_status: "ACTIVE",
    created_by: auth.user.id,
  }).select("id,record_code").single();
  if (recordError || !record) return NextResponse.json({ error: recordError?.message || "Không tạo được hồ sơ giám sát." }, { status: 400 });

  const { data: round, error: roundError } = await admin.from("monitoring_rounds").insert({
    record_id: record.id,
    checklist_version_id: version.id,
    work_year: workYear,
    scheduled_date: scheduledDate,
    started_at: null,
    completed_at: null,
    target_department_id: null,
    target_area: null,
    lead_assessor_id: auth.user.id,
    workflow_status: "SCHEDULED",
  }).select("id").single();

  if (roundError || !round) {
    await admin.from("records").update({ lifecycle_status: "ARCHIVED" }).eq("id", record.id);
    return NextResponse.json({ error: roundError?.message || "Không tạo được đợt giám sát." }, { status: 400 });
  }
  await admin.from("monitoring_assignments").insert({ monitoring_round_id: round.id, user_id: auth.user.id, assignment_role: "LEAD_ASSESSOR" });

  return NextResponse.json({ ok: true, round_id: round.id, record_code: record.record_code, status: "SCHEDULED" });
}
