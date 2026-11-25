import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,training_id,round_label,round_date,score_max,sort_order,is_open_for_submission,shuffle_questions";

// Schema hỗ trợ N đợt kiểm tra/người (xem migration
// 20261130000000_procedure_training_rounds_results_v1.sql), nhưng tạo thủ
// công qua route này (POST bên dưới) chốt tối đa 2 đợt (Pre-test + Post-
// test) theo đúng SOP thật — xem comment ở POST.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("procedure_training.view");
  if (!auth.ok) return auth.response;
  const { id: trainingId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: training } = await admin.from("procedure_trainings").select("id").eq("id", trainingId).eq("organization_id", organizationId).maybeSingle();
  if (!training) return NextResponse.json({ error: "Không tìm thấy quy trình." }, { status: 404 });

  const { data, error } = await admin.from("procedure_training_rounds").select(SELECT_COLUMNS).eq("training_id", trainingId).order("sort_order").order("round_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, rounds: data ?? [] });
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
  const roundLabel = String(body.round_label || "").trim();
  if (!roundLabel) return NextResponse.json({ error: "Chưa nhập tên đợt kiểm tra." }, { status: 400 });
  let scoreMax: number | null = null;
  if (body.score_max !== undefined && body.score_max !== null && body.score_max !== "") {
    const parsed = Number(body.score_max);
    if (!Number.isFinite(parsed) || parsed <= 0) return NextResponse.json({ error: "Thang điểm không hợp lệ." }, { status: 400 });
    scoreMax = parsed;
  }

  const { count: existingCount } = await admin.from("procedure_training_rounds").select("id", { count: "exact", head: true }).eq("training_id", trainingId);

  // Báo cáo thực tế: "1 đợt đào tạo chỉ có 1 hoặc 2 tối đa test — nếu 1 chỉ
  // có 1 post test, nếu cần đánh giá pre thì tối đa 2 cho 1 đợt, chứ không
  // thể mở nhiều đợt" — chốt tối đa 2 đợt kiểm tra (Pre-test + Post-test)
  // khi TẠO THỦ CÔNG qua route này. Không áp dụng giới hạn này cho route
  // nhập liệu hàng loạt (import/commit) — route đó find-or-create round
  // theo đúng tên cột trong file khảo sát thật để ghép dữ liệu lịch sử
  // (có thể có nhiều hơn 2 đợt trong dữ liệu cũ), mục đích khác với việc mở
  // thêm đợt kiểm tra mới cho người dùng tự làm bài qua QR.
  if ((existingCount ?? 0) >= 2) {
    return NextResponse.json({ error: "Mỗi đợt đào tạo tối đa 2 đợt kiểm tra (Pre-test + Post-test)." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("procedure_training_rounds")
    .insert({
      training_id: trainingId,
      organization_id: organizationId,
      round_label: roundLabel,
      round_date: body.round_date || null,
      score_max: scoreMax,
      sort_order: existingCount ?? 0,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Đợt kiểm tra này đã tồn tại." }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, round: data });
}
