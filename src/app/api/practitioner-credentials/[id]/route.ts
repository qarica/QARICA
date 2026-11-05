import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT =
  "id,department_id,full_name,date_of_birth,gender,national_id,phone,email,license_type,license_number,license_issued_at,license_issued_by,professional_title,display_title,scope_of_practice,scope_adjustment_text,scope_adjustment_decision_no,scope_adjustment_decision_at,scope_adjustment_issued_by,proposed_technique,registration_date,decision_no,decision_signed_at,decision_signed_by,decision_status,decision_file_url,practice_status_note,license_expiry_date,notes,created_at,updated_at";
const LICENSE_TYPES = new Set(["GPHN", "CCHN", "CCHN_DUOC"]);
const DECISION_STATUSES = new Set(["CHUA_SOAN", "DA_SOAN", "DA_KY", "LUU_HO_SO"]);
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("practitioner_credentials").select("id,organization_id").eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });

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
  if (has("full_name")) {
    const fullName = clean(body.full_name);
    if (!fullName) return NextResponse.json({ error: "Họ và tên không được để trống." }, { status: 400 });
    patch.full_name = fullName;
  }
  if (has("date_of_birth")) patch.date_of_birth = dateOrNull(body.date_of_birth);
  if (has("gender")) patch.gender = clean(body.gender) || null;
  if (has("national_id")) patch.national_id = clean(body.national_id) || null;
  if (has("phone")) patch.phone = clean(body.phone) || null;
  if (has("email")) patch.email = clean(body.email) || null;
  if (has("license_type")) {
    const licenseType = clean(body.license_type) || null;
    if (licenseType && !LICENSE_TYPES.has(licenseType)) return NextResponse.json({ error: "Loại hồ sơ không hợp lệ (chỉ nhận GPHN, CCHN, CCHN_DUOC)." }, { status: 400 });
    patch.license_type = licenseType;
  }
  if (has("license_number")) patch.license_number = clean(body.license_number) || null;
  if (has("license_issued_at")) patch.license_issued_at = dateOrNull(body.license_issued_at);
  if (has("license_issued_by")) patch.license_issued_by = clean(body.license_issued_by) || null;
  if (has("professional_title")) patch.professional_title = clean(body.professional_title) || null;
  if (has("display_title")) patch.display_title = clean(body.display_title) || null;
  if (has("scope_of_practice")) patch.scope_of_practice = clean(body.scope_of_practice) || null;
  if (has("scope_adjustment_text")) patch.scope_adjustment_text = clean(body.scope_adjustment_text) || null;
  if (has("scope_adjustment_decision_no")) patch.scope_adjustment_decision_no = clean(body.scope_adjustment_decision_no) || null;
  if (has("scope_adjustment_decision_at")) patch.scope_adjustment_decision_at = dateOrNull(body.scope_adjustment_decision_at);
  if (has("scope_adjustment_issued_by")) patch.scope_adjustment_issued_by = clean(body.scope_adjustment_issued_by) || null;
  if (has("proposed_technique")) patch.proposed_technique = clean(body.proposed_technique) || null;
  if (has("registration_date")) patch.registration_date = dateOrNull(body.registration_date);
  if (has("decision_no")) patch.decision_no = clean(body.decision_no) || null;
  if (has("decision_signed_at")) patch.decision_signed_at = dateOrNull(body.decision_signed_at);
  if (has("decision_signed_by")) patch.decision_signed_by = clean(body.decision_signed_by) || null;
  if (has("decision_status")) {
    const decisionStatus = clean(body.decision_status);
    if (!DECISION_STATUSES.has(decisionStatus)) return NextResponse.json({ error: "Trạng thái quyết định không hợp lệ." }, { status: 400 });
    patch.decision_status = decisionStatus;
  }
  if (has("decision_file_url")) patch.decision_file_url = clean(body.decision_file_url) || null;
  if (has("practice_status_note")) patch.practice_status_note = clean(body.practice_status_note) || null;
  if (has("license_expiry_date")) patch.license_expiry_date = dateOrNull(body.license_expiry_date);
  if (has("notes")) patch.notes = clean(body.notes) || null;

  const { data, error } = await admin.from("practitioner_credentials").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credentials",
    row_id: id,
    action_type: "PRACTITIONER_CREDENTIAL_UPDATE",
    new_value: patch,
    reason: "Cập nhật hồ sơ năng lực hành nghề.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, credential: data });
}
