import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,training_id,employee_name,employee_code,department,job_title,attended,attended_at,notes";

// Điểm số không còn nằm trên chính attendee (xem migration
// 20261130000000_procedure_training_rounds_results_v1.sql — "kỳ thi nào",
// 1 người có thể có N đợt kiểm tra) — GET gắn thêm `results` (điểm theo
// từng đợt) bằng 1 query tổng hợp, không N+1 theo từng người.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const { data, error } = await admin.from("procedure_training_attendees").select(SELECT_COLUMNS).eq("training_id", trainingId).order("employee_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const attendees = data ?? [];

  const attendeeIds = attendees.map((a) => a.id);
  const { data: resultRows } = attendeeIds.length
    ? await admin
        .from("procedure_training_results")
        .select("id,attendee_id,score,procedure_training_rounds(id,round_label,round_date,score_max)")
        .in("attendee_id", attendeeIds)
    : { data: [] as never[] };
  const resultsByAttendee = new Map<string, { id: string; score: number | null; round_id: string; round_label: string; round_date: string | null; score_max: number | null }[]>();
  for (const row of (resultRows ?? []) as unknown as { id: string; attendee_id: string; score: number | null; procedure_training_rounds: { id: string; round_label: string; round_date: string | null; score_max: number | null } | null }[]) {
    if (!row.procedure_training_rounds) continue;
    const list = resultsByAttendee.get(row.attendee_id) || [];
    list.push({ id: row.id, score: row.score, round_id: row.procedure_training_rounds.id, round_label: row.procedure_training_rounds.round_label, round_date: row.procedure_training_rounds.round_date, score_max: row.procedure_training_rounds.score_max });
    resultsByAttendee.set(row.attendee_id, list);
  }

  return NextResponse.json({ ok: true, attendees: attendees.map((a) => ({ ...a, results: resultsByAttendee.get(a.id) || [] })) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const employeeName = String(body.employee_name || "").trim();
  if (!employeeName) return NextResponse.json({ error: "Chưa nhập tên nhân viên." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_training_attendees")
    .insert({
      training_id: trainingId,
      organization_id: organizationId,
      employee_name: employeeName,
      employee_code: body.employee_code ? String(body.employee_code).trim() || null : null,
      department: body.department ? String(body.department).trim() || null : null,
      job_title: body.job_title ? String(body.job_title).trim() || null : null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, attendee: { ...data, results: [] } });
}
