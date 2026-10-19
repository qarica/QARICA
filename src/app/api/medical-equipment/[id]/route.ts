import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_label,notes,is_active,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();
const intOrNull = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("medical_equipment.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("medical_equipment").select("id,organization_id").eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy thiết bị hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "sequence_no")) patch.sequence_no = intOrNull(body.sequence_no);
  if (Object.prototype.hasOwnProperty.call(body, "equipment_name")) {
    const name = clean(body.equipment_name);
    if (!name) return NextResponse.json({ error: "Tên thiết bị không được để trống." }, { status: 400 });
    patch.equipment_name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "model_code")) patch.model_code = clean(body.model_code) || null;
  if (Object.prototype.hasOwnProperty.call(body, "manufacturer")) patch.manufacturer = clean(body.manufacturer) || null;
  if (Object.prototype.hasOwnProperty.call(body, "origin_country")) patch.origin_country = clean(body.origin_country) || null;
  if (Object.prototype.hasOwnProperty.call(body, "year_manufactured")) patch.year_manufactured = intOrNull(body.year_manufactured);
  if (Object.prototype.hasOwnProperty.call(body, "year_in_use")) patch.year_in_use = intOrNull(body.year_in_use);
  if (Object.prototype.hasOwnProperty.call(body, "machine_code")) patch.machine_code = clean(body.machine_code) || null;
  if (Object.prototype.hasOwnProperty.call(body, "registration_number")) patch.registration_number = clean(body.registration_number) || null;
  if (Object.prototype.hasOwnProperty.call(body, "contract_from")) patch.contract_from = dateOrNull(body.contract_from);
  if (Object.prototype.hasOwnProperty.call(body, "contract_to")) patch.contract_to = dateOrNull(body.contract_to);
  if (Object.prototype.hasOwnProperty.call(body, "valid_from")) patch.valid_from = dateOrNull(body.valid_from);
  if (Object.prototype.hasOwnProperty.call(body, "department_label")) patch.department_label = clean(body.department_label) || null;
  if (Object.prototype.hasOwnProperty.call(body, "notes")) patch.notes = clean(body.notes) || null;
  if (Object.prototype.hasOwnProperty.call(body, "is_active")) patch.is_active = body.is_active === true;

  const { data, error } = await admin.from("medical_equipment").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "medical_equipment",
    row_id: id,
    action_type: "MEDICAL_EQUIPMENT_UPDATE",
    new_value: patch,
    reason: "Cập nhật thiết bị trong Sổ quản lý TTBYT.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, equipment: data });
}
