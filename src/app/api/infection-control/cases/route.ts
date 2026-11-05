import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,department_id,patient_code,detected_date,infection_site,pathogen,related_procedure,status,notes,created_at,updated_at";
const STATUSES = new Set(["NGHI_NGO", "XAC_NHAN", "DA_XU_LY"]);
const clean = (value: unknown) => String(value ?? "").trim();
const cleanOrNull = (value: unknown) => clean(value) || null;
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function GET(request: Request) {
  const auth = await requireApiPermission("infection_control.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const departmentId = new URL(request.url).searchParams.get("department_id");
  let query = admin.from("infection_control_cases").select(SELECT).eq("organization_id", organizationId).order("detected_date", { ascending: false });
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, cases: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("infection_control.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const detectedDate = dateOrNull(body.detected_date);
  if (!detectedDate) return NextResponse.json({ error: "Ngày phát hiện không hợp lệ." }, { status: 400 });
  const infectionSite = clean(body.infection_site);
  if (!infectionSite) return NextResponse.json({ error: "Vị trí nhiễm khuẩn là bắt buộc." }, { status: 400 });

  const departmentId = cleanOrNull(body.department_id);
  if (departmentId) {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  const status = clean(body.status) || "NGHI_NGO";
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Trạng thái không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("infection_control_cases")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      patient_code: cleanOrNull(body.patient_code),
      detected_date: detectedDate,
      infection_site: infectionSite,
      pathogen: cleanOrNull(body.pathogen),
      related_procedure: cleanOrNull(body.related_procedure),
      status,
      notes: cleanOrNull(body.notes),
      created_by: auth.user.id,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "infection_control_cases",
    row_id: data.id,
    action_type: "INFECTION_CONTROL_CASE_CREATE",
    new_value: data,
    reason: "Ghi nhận ca nhiễm khuẩn bệnh viện.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, case: data });
}
