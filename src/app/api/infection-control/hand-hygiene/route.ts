import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,department_id,audit_date,observer_user_id,staff_role,opportunities_observed,opportunities_compliant,notes,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();
const cleanOrNull = (value: unknown) => clean(value) || null;
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};
const nonNegativeInt = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export async function GET(request: Request) {
  const auth = await requireApiPermission("infection_control.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const departmentId = new URL(request.url).searchParams.get("department_id");
  let query = admin.from("hand_hygiene_audits").select(SELECT).eq("organization_id", organizationId).order("audit_date", { ascending: false });
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, audits: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("infection_control.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const auditDate = dateOrNull(body.audit_date);
  if (!auditDate) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });

  const departmentId = cleanOrNull(body.department_id);
  if (departmentId) {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  const opportunitiesObserved = nonNegativeInt(body.opportunities_observed);
  const opportunitiesCompliant = nonNegativeInt(body.opportunities_compliant);
  if (opportunitiesObserved === null) return NextResponse.json({ error: "Số cơ hội quan sát không hợp lệ." }, { status: 400 });
  if (opportunitiesCompliant === null) return NextResponse.json({ error: "Số lần tuân thủ không hợp lệ." }, { status: 400 });
  if (opportunitiesCompliant > opportunitiesObserved) return NextResponse.json({ error: "Số lần tuân thủ không thể lớn hơn số cơ hội quan sát." }, { status: 400 });

  const { data, error } = await admin
    .from("hand_hygiene_audits")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      audit_date: auditDate,
      observer_user_id: cleanOrNull(body.observer_user_id),
      staff_role: cleanOrNull(body.staff_role),
      opportunities_observed: opportunitiesObserved,
      opportunities_compliant: opportunitiesCompliant,
      notes: cleanOrNull(body.notes),
      created_by: auth.user.id,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "hand_hygiene_audits",
    row_id: data.id,
    action_type: "HAND_HYGIENE_AUDIT_CREATE",
    new_value: data,
    reason: "Ghi nhận đợt giám sát tuân thủ vệ sinh tay.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, audit: data });
}
