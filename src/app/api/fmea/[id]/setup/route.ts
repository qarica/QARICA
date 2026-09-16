import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value || "").trim();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 });
  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: study }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "FMEA").maybeSingle(),
    admin.from("fmea_studies").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!caller?.is_active || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !study) return NextResponse.json({ error: "FMEA không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });
  if (study.workflow_status !== "DRAFT") return NextResponse.json({ error: "Chỉ được sửa cấu trúc khi FMEA còn ở trạng thái Nháp." }, { status: 409 });

  if (action === "ADD_STEP") {
    const stepNo = Number(body.step_no), stepName = text(body.step_name), description = text(body.description), departmentId = text(body.responsible_department_id) || null;
    if (!Number.isInteger(stepNo) || stepNo < 1 || !stepName) return NextResponse.json({ error: "Số thứ tự và tên bước quy trình là bắt buộc." }, { status: 400 });
    if (departmentId) { const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle(); if (!department) return NextResponse.json({ error: "Khoa/phòng phụ trách không hợp lệ." }, { status: 400 }); }
    const { data: existing } = await admin.from("fmea_process_steps").select("id").eq("fmea_study_id", study.id).eq("step_no", stepNo).maybeSingle();
    if (existing) return NextResponse.json({ error: `Bước số ${stepNo} đã tồn tại.` }, { status: 409 });
    const { data, error } = await admin.from("fmea_process_steps").insert({ fmea_study_id: study.id, step_no: stepNo, step_name: stepName, description: description || null, responsible_department_id: departmentId }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "fmea_process_steps", row_id: data.id, action_type: "FMEA_STEP_ADD", new_value: { step_no: stepNo, step_name: stepName }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã thêm bước quy trình." });
  }
  if (action === "ADD_MODE") {
    const stepId = text(body.process_step_id), failureMode = text(body.failure_mode), effect = text(body.potential_effect), cause = text(body.potential_cause), control = text(body.current_control), high = body.is_high_priority === true;
    if (!stepId || !failureMode) return NextResponse.json({ error: "Bước quy trình và failure mode là bắt buộc." }, { status: 400 });
    const { data: step } = await admin.from("fmea_process_steps").select("id").eq("id", stepId).eq("fmea_study_id", study.id).maybeSingle();
    if (!step) return NextResponse.json({ error: "Bước quy trình không thuộc FMEA này." }, { status: 409 });
    const { data: existing } = await admin.from("fmea_failure_modes").select("id").eq("process_step_id", stepId).ilike("failure_mode", failureMode).limit(1).maybeSingle();
    if (existing) return NextResponse.json({ error: "Failure mode này đã tồn tại trong bước quy trình." }, { status: 409 });
    const { data, error } = await admin.from("fmea_failure_modes").insert({ process_step_id: stepId, failure_mode: failureMode, potential_effect: effect || null, potential_cause: cause || null, current_control: control || null, is_high_priority: high, status: "OPEN" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "fmea_failure_modes", row_id: data.id, action_type: "FMEA_FAILURE_MODE_ADD", new_value: { process_step_id: stepId, failure_mode: failureMode, is_high_priority: high }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã thêm failure mode." });
  }
  return NextResponse.json({ error: "Thao tác thiết lập FMEA không hợp lệ." }, { status: 400 });
}
