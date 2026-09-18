import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ACTIONS = new Set(["SAVE_DRAFT", "SUBMIT"]);
const LOCKED = new Set(["REVIEWED", "FINALIZED", "COMPLETED", "APPROVED"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const [{ data: assess }, { data: manage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.assess" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
  ]);
  if (!assess && !manage) return NextResponse.json({ error: "Bạn chưa có quyền tự đánh giá tiêu chí." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").toUpperCase();
  const criteriaItemId = String(body.criteria_item_id || "").trim();
  const notEvaluated = body.not_evaluated === true;
  const note = String(body.note || "").trim();
  const rawScore = body.score;
  const score = rawScore == null || rawScore === "" ? null : Number(rawScore);

  if (!ACTIONS.has(action) || !criteriaItemId) {
    return NextResponse.json({ error: "Thiếu tiêu chí hoặc thao tác không hợp lệ." }, { status: 400 });
  }
  if (!notEvaluated && (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5)) {
    return NextResponse.json({ error: "Mức tự đánh giá phải từ 1 đến 5." }, { status: 400 });
  }
  if (notEvaluated && !note) {
    return NextResponse.json({ error: "Khi chọn Không đánh giá, cần ghi rõ lý do." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: caller }, { data: record }] = await Promise.all([
    admin.from("profiles").select("organization_id,primary_department_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status,work_year").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle(),
  ]);

  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") {
    return NextResponse.json({ error: "Đợt tự đánh giá không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });
  }

  const { data: round } = await admin.from("assessment_rounds")
    .select("id,workflow_status,criteria_version_id,work_year")
    .eq("record_id", recordId)
    .maybeSingle();
  if (!round || round.workflow_status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Chỉ được chấm khi đợt đang ở giai đoạn tự đánh giá." }, { status: 409 });
  }

  const { data: scope } = await admin.from("assessment_round_criteria")
    .select("criterion_id,is_required")
    .eq("assessment_round_id", round.id)
    .eq("criterion_id", criteriaItemId)
    .maybeSingle();
  if (!scope) return NextResponse.json({ error: "Tiêu chí không thuộc phạm vi của đợt này." }, { status: 409 });

  const { data: criterion } = await admin.from("criteria_items")
    .select("id,code,title")
    .eq("id", criteriaItemId)
    .eq("criteria_version_id", round.criteria_version_id)
    .maybeSingle();
  if (!criterion) return NextResponse.json({ error: "Tiêu chí không thuộc phiên bản đang đánh giá." }, { status: 409 });

  if (!manage) {
    const { data: responsibility } = await admin.from("criterion_responsibilities")
      .select("mapping_status,lead_department_id,source_lead_label")
      .eq("organization_id", caller.organization_id)
      .eq("work_year", Number(round.work_year || record.work_year))
      .eq("criteria_version_id", round.criteria_version_id)
      .eq("criteria_item_id", criteriaItemId)
      .maybeSingle();

    if (!responsibility || responsibility.mapping_status !== "CONFIRMED" || !responsibility.lead_department_id) {
      return NextResponse.json({ error: "Tiêu chí chưa được QLCL xác nhận phân công nên chưa thể gửi tự đánh giá." }, { status: 409 });
    }
    if (!caller.primary_department_id || responsibility.lead_department_id !== caller.primary_department_id) {
      return NextResponse.json({ error: "Tiêu chí này được phân công cho khoa/phòng khác." }, { status: 403 });
    }
  }

  const { data: existing } = await admin.from("criterion_assessments")
    .select("id,workflow_status")
    .eq("assessment_round_id", round.id)
    .eq("criteria_item_id", criteriaItemId)
    .maybeSingle();
  if (existing && LOCKED.has(String(existing.workflow_status))) {
    return NextResponse.json({ error: "Tiêu chí đã được rà soát/chốt nên không thể sửa." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const workflowStatus = action === "SUBMIT" ? "SUBMITTED" : "DRAFT";
  const values = {
    assessment_round_id: round.id,
    criteria_item_id: criteriaItemId,
    score: notEvaluated ? null : score,
    result: notEvaluated ? "Không đánh giá" : "Mức " + score,
    note: note || null,
    workflow_status: workflowStatus,
    assessed_by: auth.user.id,
    submitted_at: action === "SUBMIT" ? now : null,
    updated_at: now,
  };

  const result = existing
    ? await admin.from("criterion_assessments").update(values).eq("id", existing.id).select("id,workflow_status").single()
    : await admin.from("criterion_assessments").insert(values).select("id,workflow_status").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    record_id: recordId,
    table_name: "criterion_assessments",
    row_id: result.data.id,
    action_type: action === "SUBMIT" ? "SUBMIT_CRITERION_ASSESSMENT" : "SAVE_CRITERION_ASSESSMENT_DRAFT",
    new_value: {
      criteria_item_id: criteriaItemId,
      code: criterion.code,
      score: values.score,
      result: values.result,
      workflow_status: workflowStatus,
    },
    request_meta: { source: "qlcl-ui", responsibility_routing: manage ? "manager_override" : "confirmed_department" },
  });

  return NextResponse.json({
    ok: true,
    status: workflowStatus,
    message: action === "SUBMIT" ? "Đã gửi đánh giá tiêu chí." : "Đã lưu nháp tiêu chí.",
  });
}
