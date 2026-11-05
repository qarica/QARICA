import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,department_id,audit_date,observer_user_id,staff_role,opportunities_observed,opportunities_compliant,notes,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};
const nonNegativeInt = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("infection_control.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("hand_hygiene_audits").select("id,organization_id,opportunities_observed,opportunities_compliant").eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy đợt giám sát hoặc ngoài phạm vi truy cập." }, { status: 404 });

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
  if (has("audit_date")) {
    const auditDate = dateOrNull(body.audit_date);
    if (!auditDate) return NextResponse.json({ error: "Ngày giám sát không hợp lệ." }, { status: 400 });
    patch.audit_date = auditDate;
  }
  if (has("observer_user_id")) patch.observer_user_id = clean(body.observer_user_id) || null;
  if (has("staff_role")) patch.staff_role = clean(body.staff_role) || null;
  if (has("notes")) patch.notes = clean(body.notes) || null;

  const effectiveObserved = has("opportunities_observed") ? nonNegativeInt(body.opportunities_observed) : existing.opportunities_observed;
  const effectiveCompliant = has("opportunities_compliant") ? nonNegativeInt(body.opportunities_compliant) : existing.opportunities_compliant;
  if (has("opportunities_observed")) {
    if (effectiveObserved === null) return NextResponse.json({ error: "Số cơ hội quan sát không hợp lệ." }, { status: 400 });
    patch.opportunities_observed = effectiveObserved;
  }
  if (has("opportunities_compliant")) {
    if (effectiveCompliant === null) return NextResponse.json({ error: "Số lần tuân thủ không hợp lệ." }, { status: 400 });
    patch.opportunities_compliant = effectiveCompliant;
  }
  if ((effectiveObserved ?? 0) < (effectiveCompliant ?? 0)) return NextResponse.json({ error: "Số lần tuân thủ không thể lớn hơn số cơ hội quan sát." }, { status: 400 });

  const { data, error } = await admin.from("hand_hygiene_audits").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "hand_hygiene_audits",
    row_id: id,
    action_type: "HAND_HYGIENE_AUDIT_UPDATE",
    new_value: patch,
    reason: "Cập nhật đợt giám sát tuân thủ vệ sinh tay.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, audit: data });
}
