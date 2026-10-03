import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes";

const EDITABLE_FIELDS = [
  "trainer",
  "session_1_time",
  "session_1_location",
  "session_1_method",
  "status",
  "feedback_qlcl",
  "session_2_time",
  "session_2_location",
  "session_2_method",
  "notes",
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "status") {
      if (!["TRAINED", "PLANNED", "NOT_PLANNED"].includes(body.status)) {
        return NextResponse.json({ error: "Tình trạng không hợp lệ." }, { status: 400 });
      }
      update.status = body.status;
    } else {
      update[field] = String(body[field]).trim() || null;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("procedure_trainings")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });
  return NextResponse.json({ ok: true, training: data });
}
