import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,procedure_code,procedure_name,drafting_unit,effective_date,trainer,session_1_time,session_1_location,session_1_method,status,feedback_qlcl,session_2_time,session_2_location,session_2_method,notes";

export async function GET() {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_trainings")
    .select(SELECT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Tỷ lệ hoàn thành (đã đào tạo / tổng số nhân sự đăng ký) tính từ bảng con
  // procedure_training_attendees — 1 query tổng hợp thay vì N+1 theo từng dòng.
  const trainingIds = (data ?? []).map((t) => t.id);
  const { data: attendeeRows } = trainingIds.length
    ? await admin.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)
    : { data: [] as { training_id: string; attended: boolean }[] };
  const counts = new Map<string, { total: number; attended: number }>();
  for (const row of attendeeRows ?? []) {
    const current = counts.get(row.training_id) || { total: 0, attended: 0 };
    current.total += 1;
    if (row.attended) current.attended += 1;
    counts.set(row.training_id, current);
  }
  const trainings = (data ?? []).map((t) => ({
    ...t,
    attendee_total: counts.get(t.id)?.total || 0,
    attendee_attended: counts.get(t.id)?.attended || 0,
  }));

  return NextResponse.json({ ok: true, trainings });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const procedureName = String(body.procedure_name || "").trim();
  if (!procedureName) return NextResponse.json({ error: "Chưa nhập tên quy trình." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_trainings")
    .insert({
      organization_id: organizationId,
      procedure_code: body.procedure_code ? String(body.procedure_code).trim() || null : null,
      procedure_name: procedureName,
      drafting_unit: body.drafting_unit ? String(body.drafting_unit).trim() || null : null,
      effective_date: body.effective_date || null,
      created_by: auth.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, training: data });
}
