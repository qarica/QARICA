import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ACTIONS = new Set(["SAVE_DRAFT", "SUBMIT"]);

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
  const criterionId = String(body.criterion_id || "").trim();
  const proposedLevelId = String(body.proposed_level_id || "").trim();
  const summaryComment = String(body.summary_comment || "").trim();
  if (!ACTIONS.has(action) || !criterionId || !proposedLevelId) return NextResponse.json({ error: "Thiếu tiêu chí, mức đánh giá hoặc thao tác không hợp lệ." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: caller }, { data: record }] = await Promise.all([
    admin.from("profiles").select("organization_id,primary_department_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "ASSESSMENT").maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Đợt tự đánh giá không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });

  const { data: round } = await admin.from("assessment_rounds").select("id,workflow_status").eq("record_id", recordId).maybeSingle();
  if (!round || round.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ được chấm khi đợt đang ở giai đoạn tự đánh giá." }, { status: 409 });
  const [{ data: scope }, { data: level }] = await Promise.all([
    admin.from("assessment_round_criteria").select("criterion_id").eq("assessment_round_id", round.id).eq("criterion_id", criterionId).maybeSingle(),
    admin.from("criterion_levels").select("id,criterion_id").eq("id", proposedLevelId).eq("criterion_id", criterionId).maybeSingle(),
  ]);
  if (!scope || !level) return NextResponse.json({ error: "Tiêu chí hoặc mức đánh giá không thuộc phạm vi của đợt này." }, { status: 409 });

  let existingQuery = admin.from("criterion_assessments").select("id,workflow_status").eq("assessment_round_id", round.id).eq("criterion_id", criterionId);
  existingQuery = caller.primary_department_id ? existingQuery.eq("department_id", caller.primary_department_id) : existingQuery.is("department_id", null);
  const { data: existing } = await existingQuery.limit(1).maybeSingle();
  if (existing && ["REVIEWED", "FINALIZED", "COMPLETED", "APPROVED"].includes(String(existing.workflow_status))) return NextResponse.json({ error: "Tiêu chí đã được rà soát/chốt nên không thể sửa." }, { status: 409 });

  const now = new Date().toISOString();
  const values = {
    assessment_round_id: round.id,
    criterion_id: criterionId,
    department_id: caller.primary_department_id || null,
    proposed_level_id: proposedLevelId,
    self_assessor_user_id: auth.user.id,
    summary_comment: summaryComment || null,
    workflow_status: action === "SUBMIT" ? "SUBMITTED" : "DRAFT",
    submitted_at: action === "SUBMIT" ? now : null,
  };
  const result = existing
    ? await admin.from("criterion_assessments").update(values).eq("id", existing.id).select("id,workflow_status").single()
    : await admin.from("criterion_assessments").insert(values).select("id,workflow_status").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "criterion_assessments", row_id: result.data.id, action_type: action === "SUBMIT" ? "SUBMIT_CRITERION_ASSESSMENT" : "SAVE_CRITERION_ASSESSMENT_DRAFT", new_value: { criterion_id: criterionId, proposed_level_id: proposedLevelId, workflow_status: values.workflow_status }, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: values.workflow_status, message: action === "SUBMIT" ? "Đã gửi đánh giá tiêu chí." : "Đã lưu nháp tiêu chí." });
}
