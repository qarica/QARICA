import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const FREQUENCIES = new Set(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]);

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("indicators.manage");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const frequency = String(body.frequency || "").toUpperCase();
  const activeFrom = body.active_from;
  const activeTo = body.active_to || null;
  const autoCreate = body.auto_create_periods === true;
  const sourceReference = String(body.source_reference || "").trim() || null;

  if (!FREQUENCIES.has(frequency)) {
    return NextResponse.json({ error: "Tần suất chỉ số không hợp lệ." }, { status: 400 });
  }
  if (!validDate(activeFrom) || (activeTo && !validDate(activeTo))) {
    return NextResponse.json({ error: "Ngày bắt đầu/kết thúc vận hành không hợp lệ." }, { status: 400 });
  }
  if (activeTo && activeTo < activeFrom) {
    return NextResponse.json({ error: "Ngày kết thúc không được trước ngày bắt đầu." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (callerError || !caller?.organization_id) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản chưa gắn bệnh viện." }, { status: 400 });
  }

  const { data: assignment, error: assignmentError } = await admin
    .from("indicator_assignments")
    .select("id,indicator_version_id,department_id,work_year,status,frequency,active_from,active_to,auto_create_periods,source_reference")
    .eq("id", id)
    .maybeSingle();
  if (assignmentError || !assignment) {
    return NextResponse.json({ error: assignmentError?.message || "Không tìm thấy phân công chỉ số." }, { status: 404 });
  }
  if (assignment.status !== "ACTIVE") {
    return NextResponse.json({ error: "Chỉ có thể cấu hình phân công chỉ số đang hoạt động." }, { status: 409 });
  }

  const [{ data: version, error: versionError }, departmentResult] = await Promise.all([
    admin.from("indicator_definition_versions").select("indicator_definition_id").eq("id", assignment.indicator_version_id).maybeSingle(),
    assignment.department_id
      ? admin.from("departments").select("id,organization_id").eq("id", assignment.department_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (versionError || !version) {
    return NextResponse.json({ error: versionError?.message || "Phiên bản chỉ số không hợp lệ." }, { status: 409 });
  }
  if (departmentResult.error || (departmentResult.data && departmentResult.data.organization_id !== caller.organization_id)) {
    return NextResponse.json({ error: departmentResult.error?.message || "Phân công chỉ số nằm ngoài phạm vi bệnh viện." }, { status: 403 });
  }

  const { data: definition, error: definitionError } = await admin
    .from("indicator_definitions")
    .select("id,organization_id,code,name")
    .eq("id", version.indicator_definition_id)
    .maybeSingle();
  if (definitionError || !definition || (definition.organization_id && definition.organization_id !== caller.organization_id)) {
    return NextResponse.json({ error: definitionError?.message || "Chỉ số nằm ngoài phạm vi bệnh viện." }, { status: 403 });
  }

  const workYear = Number(assignment.work_year);
  if (Number(activeFrom.slice(0, 4)) !== workYear || (activeTo && Number(activeTo.slice(0, 4)) !== workYear)) {
    return NextResponse.json({ error: "Khoảng vận hành phải nằm trong năm của phân công chỉ số." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from("indicator_assignments")
    .update({
      frequency,
      active_from: activeFrom,
      active_to: activeTo,
      auto_create_periods: autoCreate,
      source_reference: sourceReference,
    })
    .eq("id", id)
    .select("id,frequency,active_from,active_to,auto_create_periods,source_reference")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "indicator_assignments",
    row_id: id,
    action_type: "CONFIGURE_INDICATOR_AUTOMATION",
    new_value: {
      definition_id: definition.id,
      code: definition.code,
      name: definition.name,
      frequency,
      active_from: activeFrom,
      active_to: activeTo,
      auto_create_periods: autoCreate,
      source_reference: sourceReference,
    },
    request_meta: { source: "qlcl-ui", automation: "indicator-periods-v1" },
  });

  return NextResponse.json({ ok: true, assignment: updated });
}
