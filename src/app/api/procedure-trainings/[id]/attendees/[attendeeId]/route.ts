import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,training_id,employee_name,employee_code,attended,attended_at,notes";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, attendeeId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.attended === "boolean") {
    update.attended = body.attended;
    update.attended_at = body.attended ? new Date().toISOString().slice(0, 10) : null;
  }
  if (body.notes !== undefined) update.notes = String(body.notes).trim() || null;
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_training_attendees")
    .update(update)
    .eq("id", attendeeId)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy nhân sự trong danh sách." }, { status: 404 });
  return NextResponse.json({ ok: true, attendee: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, attendeeId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { error, count } = await admin
    .from("procedure_training_attendees")
    .delete({ count: "exact" })
    .eq("id", attendeeId)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy nhân sự trong danh sách." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
