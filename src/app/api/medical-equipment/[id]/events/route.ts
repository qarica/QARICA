import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,equipment_id,event_type,to_department_id,event_date,note,created_by,created_at";
const EVENT_TYPES = new Set(["ASSIGN", "TRANSFER", "RETURN", "MAINTENANCE_START", "MAINTENANCE_DONE", "NOTE"]);
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

async function loadEquipment(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin.from("medical_equipment").select("id,organization_id").eq("id", id).maybeSingle();
  return data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("medical_equipment.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const equipment = await loadEquipment(admin, id);
  if (!equipment || equipment.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy thiết bị hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { data, error } = await admin
    .from("medical_equipment_events")
    .select(SELECT)
    .eq("equipment_id", id)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, events: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("medical_equipment.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const equipment = await loadEquipment(admin, id);
  if (!equipment || equipment.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy thiết bị hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const eventType = clean(body.event_type);
  if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Loại sự kiện không hợp lệ." }, { status: 400 });

  const toDepartmentId = clean(body.to_department_id) || null;
  if (toDepartmentId) {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", toDepartmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  const eventDate = dateOrNull(body.event_date) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  const { data: event, error } = await admin
    .from("medical_equipment_events")
    .insert({
      organization_id: organizationId,
      equipment_id: id,
      event_type: eventType,
      to_department_id: toDepartmentId,
      event_date: eventDate,
      note: clean(body.note) || null,
      created_by: auth.user.id,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Đồng bộ 1 chiều từ sự kiện vào thiết bị cho các loại sự kiện có ánh xạ rõ
  // ràng tới 1 trường đang theo dõi (department_id/status) — tránh 2 nguồn sự
  // thật lệch nhau giữa "trạng thái/khoa hiện tại" và lịch sử sự kiện. RETURN/
  // NOTE chỉ ghi log, không có hiệu ứng tự động.
  const equipmentPatch: Record<string, unknown> = {};
  if ((eventType === "ASSIGN" || eventType === "TRANSFER") && toDepartmentId) equipmentPatch.department_id = toDepartmentId;
  if (eventType === "MAINTENANCE_START") equipmentPatch.status = "MAINTENANCE";
  if (eventType === "MAINTENANCE_DONE") equipmentPatch.status = "IN_USE";

  if (Object.keys(equipmentPatch).length) {
    equipmentPatch.updated_at = new Date().toISOString();
    const { error: updateError } = await admin.from("medical_equipment").update(equipmentPatch).eq("id", id);
    if (updateError) return NextResponse.json({ error: `Đã lưu sự kiện nhưng không cập nhật được thiết bị: ${updateError.message}` }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "medical_equipment_events",
    row_id: event.id,
    action_type: "MEDICAL_EQUIPMENT_EVENT_CREATE",
    new_value: { ...event, equipment_patch: equipmentPatch },
    reason: "Ghi nhận sự kiện bàn giao/bảo trì thiết bị.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, event, equipment_patch: equipmentPatch });
}
