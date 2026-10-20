import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,sequence_no,equipment_name,model_code,manufacturer,origin_country,year_manufactured,year_in_use,machine_code,registration_number,contract_from,contract_to,valid_from,department_id,department_label,notes,is_active,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();
const cleanOrNull = (value: unknown) => clean(value) || null;
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

export async function GET(request: Request) {
  const auth = await requireApiPermission("medical_equipment.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const showInactive = new URL(request.url).searchParams.get("inactive") === "1";
  let query = admin.from("medical_equipment").select(SELECT).eq("organization_id", organizationId).order("sequence_no", { ascending: true, nullsFirst: false }).order("equipment_name", { ascending: true });
  if (!showInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, equipment: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("medical_equipment.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const equipmentName = clean(body.equipment_name);
  if (!equipmentName) return NextResponse.json({ error: "Tên thiết bị là bắt buộc." }, { status: 400 });

  // Khoa sử dụng chọn từ danh mục khoa/phòng đã cấu hình (department_id),
  // không gõ tay tự do nữa — tránh lặp lại tình trạng lệch tên như dữ liệu
  // nhập đợt đầu (CẤP CỨU/Khoa Cấp Cứu, XN/Xét nghiệm/Xét Nghiệm/Khoa XN...).
  const departmentId = cleanOrNull(body.department_id);
  if (departmentId) {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("medical_equipment")
    .insert({
      organization_id: organizationId,
      sequence_no: intOrNull(body.sequence_no),
      equipment_name: equipmentName,
      model_code: cleanOrNull(body.model_code),
      manufacturer: cleanOrNull(body.manufacturer),
      origin_country: cleanOrNull(body.origin_country),
      year_manufactured: intOrNull(body.year_manufactured),
      year_in_use: intOrNull(body.year_in_use),
      machine_code: cleanOrNull(body.machine_code),
      registration_number: cleanOrNull(body.registration_number),
      contract_from: dateOrNull(body.contract_from),
      contract_to: dateOrNull(body.contract_to),
      valid_from: dateOrNull(body.valid_from),
      department_id: departmentId,
      notes: cleanOrNull(body.notes),
      created_by: auth.user.id,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "medical_equipment",
    row_id: data.id,
    action_type: "MEDICAL_EQUIPMENT_CREATE",
    new_value: data,
    reason: "Thêm thiết bị vào Sổ quản lý TTBYT.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, equipment: data });
}
