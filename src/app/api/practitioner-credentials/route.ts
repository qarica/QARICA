import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT =
  "id,department_id,full_name,date_of_birth,gender,national_id,phone,email,license_type,license_number,license_issued_at,license_issued_by,professional_title,display_title,scope_of_practice,scope_adjustment_text,scope_adjustment_decision_no,scope_adjustment_decision_at,scope_adjustment_issued_by,proposed_technique,registration_date,decision_no,decision_signed_at,decision_signed_by,decision_status,decision_file_url,practice_status_note,license_expiry_date,notes,created_at,updated_at";
const LICENSE_TYPES = new Set(["GPHN", "CCHN", "CCHN_DUOC"]);
const DECISION_STATUSES = new Set(["CHUA_SOAN", "DA_SOAN", "DA_KY", "LUU_HO_SO"]);
const clean = (value: unknown) => String(value ?? "").trim();
const cleanOrNull = (value: unknown) => clean(value) || null;
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function GET(request: Request) {
  const auth = await requireApiPermission("practitioner_credentials.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const departmentId = new URL(request.url).searchParams.get("department_id");
  let query = admin.from("practitioner_credentials").select(SELECT).eq("organization_id", organizationId).order("full_name", { ascending: true });
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, credentials: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const fullName = clean(body.full_name);
  if (!fullName) return NextResponse.json({ error: "Họ và tên là bắt buộc." }, { status: 400 });

  const departmentId = cleanOrNull(body.department_id);
  if (departmentId) {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  const licenseType = cleanOrNull(body.license_type);
  if (licenseType && !LICENSE_TYPES.has(licenseType)) return NextResponse.json({ error: "Loại hồ sơ không hợp lệ (chỉ nhận GPHN, CCHN, CCHN_DUOC)." }, { status: 400 });

  const decisionStatus = clean(body.decision_status) || "CHUA_SOAN";
  if (!DECISION_STATUSES.has(decisionStatus)) return NextResponse.json({ error: "Trạng thái quyết định không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("practitioner_credentials")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      full_name: fullName,
      date_of_birth: dateOrNull(body.date_of_birth),
      gender: cleanOrNull(body.gender),
      national_id: cleanOrNull(body.national_id),
      phone: cleanOrNull(body.phone),
      email: cleanOrNull(body.email),
      license_type: licenseType,
      license_number: cleanOrNull(body.license_number),
      license_issued_at: dateOrNull(body.license_issued_at),
      license_issued_by: cleanOrNull(body.license_issued_by),
      professional_title: cleanOrNull(body.professional_title),
      display_title: cleanOrNull(body.display_title),
      scope_of_practice: cleanOrNull(body.scope_of_practice),
      scope_adjustment_text: cleanOrNull(body.scope_adjustment_text),
      scope_adjustment_decision_no: cleanOrNull(body.scope_adjustment_decision_no),
      scope_adjustment_decision_at: dateOrNull(body.scope_adjustment_decision_at),
      scope_adjustment_issued_by: cleanOrNull(body.scope_adjustment_issued_by),
      proposed_technique: cleanOrNull(body.proposed_technique),
      registration_date: dateOrNull(body.registration_date),
      decision_no: cleanOrNull(body.decision_no),
      decision_signed_at: dateOrNull(body.decision_signed_at),
      decision_signed_by: cleanOrNull(body.decision_signed_by),
      decision_status: decisionStatus,
      decision_file_url: cleanOrNull(body.decision_file_url),
      practice_status_note: cleanOrNull(body.practice_status_note),
      license_expiry_date: dateOrNull(body.license_expiry_date),
      notes: cleanOrNull(body.notes),
      created_by: auth.user.id,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credentials",
    row_id: data.id,
    action_type: "PRACTITIONER_CREDENTIAL_CREATE",
    new_value: data,
    reason: "Thêm hồ sơ năng lực hành nghề.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, credential: data });
}
