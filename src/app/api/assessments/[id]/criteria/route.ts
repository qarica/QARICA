import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Danh sách tiêu chí trong phạm vi 1 đợt tự đánh giá, kèm điểm đã chấm (nếu có).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("id").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đợt tự đánh giá." }, { status: 404 });

  const { data: round } = await admin.from("assessment_rounds").select("id").eq("record_id", recordId).maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy dữ liệu đợt đánh giá." }, { status: 404 });

  const { data: scope, error: scopeError } = await admin
    .from("assessment_round_criteria")
    .select("criterion_id, is_required, workflow_status")
    .eq("assessment_round_id", round.id);
  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });

  const criterionIds = (scope ?? []).map((s: any) => s.criterion_id);
  const { data: items } = criterionIds.length
    ? await admin.from("criteria_items").select("id,code,title,description,sequence_no").in("id", criterionIds).order("sequence_no", { ascending: true })
    : { data: [] };

  const { data: assessments } = criterionIds.length
    ? await admin.from("criterion_assessments").select("id,criteria_item_id,score,result,note,workflow_status").eq("assessment_round_id", round.id)
    : { data: [] };

  const assessmentMap = new Map((assessments ?? []).map((a: any) => [a.criteria_item_id, a]));
  const scopeMap = new Map((scope ?? []).map((s: any) => [s.criterion_id, s]));

  const criteria = (items ?? []).map((item: any) => {
    const a = assessmentMap.get(item.id);
    const s = scopeMap.get(item.id);
    return {
      criteria_item_id: item.id,
      code: item.code,
      title: item.title,
      description: item.description,
      sequence_no: item.sequence_no,
      is_required: s?.is_required ?? true,
      score: a?.score ?? null,
      result: a?.result ?? null,
      note: a?.note ?? "",
      workflow_status: a?.workflow_status ?? "DRAFT",
    };
  });

  return NextResponse.json({
    assessment_round_id: round.id,
    total: criteria.length,
    scored: criteria.filter((c: any) => c.workflow_status !== "DRAFT" || c.result).length,
    criteria,
  });
}

// Lưu điểm tự chấm cho một tiêu chí (tạo mới hoặc cập nhật).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: canAssess } = await supabase.rpc("has_permission", { p_permission_code: "criteria.assess" });
  const { data: canManage } = await supabase.rpc("has_permission", { p_permission_code: "criteria.manage" });
  if (!canAssess && !canManage) return NextResponse.json({ error: "Bạn không có quyền chấm điểm tiêu chí." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const criteriaItemId = String(body.criteria_item_id || "");
  const result = body.result ? String(body.result) : null;
  const score = body.score === null || body.score === undefined || body.score === "" ? null : Number(body.score);
  const note = body.note ? String(body.note) : null;
  if (!criteriaItemId) return NextResponse.json({ error: "Thiếu tiêu chí cần chấm." }, { status: 400 });

  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("id").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle();
  if (!record) return NextResponse.json({ error: "Không tìm thấy đợt tự đánh giá." }, { status: 404 });
  const { data: round } = await admin.from("assessment_rounds").select("id").eq("record_id", recordId).maybeSingle();
  if (!round) return NextResponse.json({ error: "Không tìm thấy dữ liệu đợt đánh giá." }, { status: 404 });

  const { data: existing } = await admin
    .from("criterion_assessments")
    .select("id")
    .eq("assessment_round_id", round.id)
    .eq("criteria_item_id", criteriaItemId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("criterion_assessments")
      .update({ score, result, note, workflow_status: "SUBMITTED" })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("criterion_assessments").insert({
      assessment_round_id: round.id,
      criteria_item_id: criteriaItemId,
      score,
      result,
      note,
      workflow_status: "SUBMITTED",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
