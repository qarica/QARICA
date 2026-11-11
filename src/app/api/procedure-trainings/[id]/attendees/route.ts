import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,training_id,employee_name,employee_code,attended,attended_at,notes,pre_test_score,post_test_score";

function parseOptionalScore(value: unknown): { ok: true; score: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, score: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, score: parsed };
}

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
  return NextResponse.json({ ok: true, attendees: data ?? [] });
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
  const preScore = parseOptionalScore(body.pre_test_score);
  const postScore = parseOptionalScore(body.post_test_score);
  if (!preScore.ok || !postScore.ok) return NextResponse.json({ error: "Điểm Pre/Post-test không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_training_attendees")
    .insert({
      training_id: trainingId,
      organization_id: organizationId,
      employee_name: employeeName,
      employee_code: body.employee_code ? String(body.employee_code).trim() || null : null,
      pre_test_score: preScore.score,
      post_test_score: postScore.score,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, attendee: data });
}
