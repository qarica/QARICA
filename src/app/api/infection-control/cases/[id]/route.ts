import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,department_id,patient_code,detected_date,infection_site,pathogen,related_procedure,status,notes,created_at,updated_at";
const STATUSES = new Set(["NGHI_NGO", "XAC_NHAN", "DA_XU_LY"]);
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("infection_control.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("infection_control_cases").select("id,organization_id").eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy ca nhiễm khuẩn hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  if (has("department_id")) {
    const departmentId = clean(body.department_id) || null;
    if (departmentId) {
      const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
      if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
      if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
    }
    patch.department_id = departmentId;
  }
  if (has("patient_code")) patch.patient_code = clean(body.patient_code) || null;
  if (has("detected_date")) {
    const detectedDate = dateOrNull(body.detected_date);
    if (!detectedDate) return NextResponse.json({ error: "Ngày phát hiện không hợp lệ." }, { status: 400 });
    patch.detected_date = detectedDate;
  }
  if (has("infection_site")) {
    const infectionSite = clean(body.infection_site);
    if (!infectionSite) return NextResponse.json({ error: "Vị trí nhiễm khuẩn không được để trống." }, { status: 400 });
    patch.infection_site = infectionSite;
  }
  if (has("pathogen")) patch.pathogen = clean(body.pathogen) || null;
  if (has("related_procedure")) patch.related_procedure = clean(body.related_procedure) || null;
  if (has("status")) {
    const status = clean(body.status);
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });
    patch.status = status;
  }
  if (has("notes")) patch.notes = clean(body.notes) || null;

  const { data, error } = await admin.from("infection_control_cases").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "infection_control_cases",
    row_id: id,
    action_type: "INFECTION_CONTROL_CASE_UPDATE",
    new_value: patch,
    reason: "Cập nhật ca nhiễm khuẩn bệnh viện.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, case: data });
}
