import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,training_id,round_label,round_date,score_max,sort_order";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, roundId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.round_label !== undefined) {
    const label = String(body.round_label).trim();
    if (!label) return NextResponse.json({ error: "Tên đợt kiểm tra không được để trống." }, { status: 400 });
    update.round_label = label;
  }
  if (body.round_date !== undefined) update.round_date = body.round_date || null;
  if (body.score_max !== undefined) {
    if (body.score_max === null || body.score_max === "") {
      update.score_max = null;
    } else {
      const parsed = Number(body.score_max);
      if (!Number.isFinite(parsed) || parsed <= 0) return NextResponse.json({ error: "Thang điểm không hợp lệ." }, { status: 400 });
      update.score_max = parsed;
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });

  const { data, error } = await admin
    .from("procedure_training_rounds")
    .update(update)
    .eq("id", roundId)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Đợt kiểm tra này đã tồn tại." }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });
  return NextResponse.json({ ok: true, round: data });
}

// Xoá 1 đợt kiểm tra xoá cascade toàn bộ kết quả + câu trả lời của đợt đó
// (on delete cascade ở migration) — không xoá người tham dự hay các đợt
// kiểm tra khác.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const auth = await requireApiPermission("procedure_training.manage");
  if (!auth.ok) return auth.response;
  const { id: trainingId, roundId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { error, count } = await admin
    .from("procedure_training_rounds")
    .delete({ count: "exact" })
    .eq("id", roundId)
    .eq("training_id", trainingId)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Không tìm thấy đợt kiểm tra." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
