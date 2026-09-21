import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value ?? "").trim();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const [{ data: manage }, { data: review }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "criteria.manage" }),
    supabase.rpc("has_permission", { p_permission_code: "criteria.review" }),
  ]);
  if (!manage && !review) return NextResponse.json({ error: "Bạn chưa có quyền xử lý đánh giá ngoài." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const command = text(body.action).toUpperCase();
  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "EXTERNAL_ASSESSMENT").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy hồ sơ đánh giá ngoài hoặc bạn không có quyền xem." }, { status: 404 });

  const admin = createAdminClient();
  const { data: record } = await admin.from("records").select("id,organization_id,record_code,title,work_year,owner_department_id,owner_user_id,lifecycle_status").eq("id", recordId).single();
  const { data: event } = await admin.from("external_assessment_events").select("id,criteria_version_id,assessment_date").eq("record_id", recordId).single();
  if (!record || !event) return NextResponse.json({ error: "Thiếu dữ liệu đánh giá ngoài." }, { status: 404 });
  const now = new Date().toISOString();

  if (command === "LINK_SELF") {
    const selfRecordId = text(body.self_record_id);
    const { data: selfRecord } = await admin.from("records").select("id,record_code,lifecycle_status").eq("id", selfRecordId).eq("record_type", "ASSESSMENT").maybeSingle();
    const { data: round } = selfRecord ? await admin.from("assessment_rounds").select("criteria_version_id,workflow_status").eq("record_id", selfRecord.id).maybeSingle() : { data: null };
    if (!selfRecord || !round) return NextResponse.json({ error: "Đợt tự đánh giá được chọn không hợp lệ." }, { status: 400 });
    if (event.criteria_version_id && round.criteria_version_id !== event.criteria_version_id) return NextResponse.json({ error: "Đánh giá ngoài và tự đánh giá phải cùng phiên bản bộ tiêu chí." }, { status: 409 });
    if (round.workflow_status !== "FINALIZED") return NextResponse.json({ error: "Chỉ được đối chiếu với đợt tự đánh giá đã chốt." }, { status: 409 });
    const { data: current } = await admin.from("record_links").select("id,target_record_id").eq("source_record_id", recordId).eq("relation_type", "COMPARED_WITH_SELF").maybeSingle();
    if (current?.target_record_id && current.target_record_id !== selfRecordId) return NextResponse.json({ error: "Đợt đối chiếu đã được khóa; không được thay để bảo toàn dấu vết." }, { status: 409 });
    const mutation = current ? admin.from("record_links").update({ metadata: { self_record_code: selfRecord.record_code } }).eq("id", current.id) : admin.from("record_links").insert({ source_record_id: recordId, target_record_id: selfRecordId, relation_type: "COMPARED_WITH_SELF", metadata: { self_record_code: selfRecord.record_code }, created_by: auth.user.id });
    const { error } = await mutation;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_assessment_events", row_id: event.id, action_type: "EXTERNAL_ASSESSMENT_LINK_SELF", new_value: { self_record_id: selfRecordId }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã khóa đợt tự đánh giá dùng để đối chiếu." });
  }

  if (command === "SAVE_EXTERNAL_SCORE") {
    const { data: comparison } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "COMPARED_WITH_SELF").maybeSingle();
    if (!comparison) return NextResponse.json({ error: "Cần khóa đợt tự đánh giá đối chiếu trước." }, { status: 409 });
    const criterionId = text(body.criteria_item_id);
    const externalRaw = body.external_score;
    const externalScore = externalRaw === "" || externalRaw == null ? null : Number(externalRaw);
    const note = text(body.note);
    if (!criterionId || externalScore == null || !Number.isFinite(externalScore)) return NextResponse.json({ error: "Cần chọn tiêu chí và nhập điểm đoàn Sở Y tế hợp lệ." }, { status: 400 });
    const { data: selfRound } = await admin.from("assessment_rounds").select("id,criteria_version_id,workflow_status").eq("record_id", comparison.target_record_id).maybeSingle();
    if (!selfRound || (event.criteria_version_id && selfRound.criteria_version_id !== event.criteria_version_id)) return NextResponse.json({ error: "Đợt tự đánh giá không cùng phiên bản bộ tiêu chí." }, { status: 409 });
    if (selfRound.workflow_status !== "FINALIZED") return NextResponse.json({ error: "Đợt tự đánh giá nguồn không còn ở trạng thái đã chốt." }, { status: 409 });
    const { data: scopeItem } = await admin.from("assessment_round_criteria").select("applicability_status").eq("assessment_round_id", selfRound.id).or(`criteria_item_id.eq.${criterionId},criterion_id.eq.${criterionId}`).maybeSingle();
    if (!scopeItem) return NextResponse.json({ error: "Tiêu chí không nằm trong phạm vi đợt tự đánh giá đã chốt." }, { status: 409 });
    if (String(scopeItem.applicability_status || "APPLICABLE") !== "APPLICABLE") return NextResponse.json({ error: "Tiêu chí Không áp dụng (N/A) không được nhập điểm đánh giá ngoài." }, { status: 409 });
    const { data: selfAssessment } = await admin.from("criterion_assessments").select("score,workflow_status").eq("assessment_round_id", selfRound.id).eq("criteria_item_id", criterionId).maybeSingle();
    if (selfAssessment?.score == null) return NextResponse.json({ error: "Tiêu chí chưa có điểm tự đánh giá đã chốt để đối chiếu." }, { status: 409 });
    const { data: item } = await admin.from("criteria_items").select("id,max_score").eq("id", criterionId).eq("criteria_version_id", selfRound.criteria_version_id).maybeSingle();
    if (!item) return NextResponse.json({ error: "Tiêu chí không thuộc bộ tiêu chí đang đối chiếu." }, { status: 409 });
    if (externalScore < 0 || (item.max_score != null && externalScore > Number(item.max_score))) return NextResponse.json({ error: "Điểm đoàn Sở Y tế nằm ngoài thang điểm của tiêu chí." }, { status: 400 });
    const values = { external_assessment_event_id: event.id, criteria_item_id: criterionId, self_score: selfAssessment?.score ?? null, external_score: externalScore, note: note || null, entered_by: auth.user.id, updated_at: now };
    const { data: existing } = await admin.from("external_assessment_scores").select("id").eq("external_assessment_event_id", event.id).eq("criteria_item_id", criterionId).maybeSingle();
    const saved = existing ? await admin.from("external_assessment_scores").update(values).eq("id", existing.id) : await admin.from("external_assessment_scores").insert(values);
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_assessment_scores", row_id: existing?.id ?? null, action_type: "SAVE_EXTERNAL_ASSESSMENT_SCORE", new_value: { criteria_item_id: criterionId, self_score: values.self_score, external_score: externalScore }, reason: note || null, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã lưu điểm đoàn Sở Y tế để đối chiếu." });
  }

  if (command === "CLOSE_COMPARISON") {
    if (!manage) return NextResponse.json({ error: "Chỉ người quản lý bộ tiêu chí được chốt đối chiếu." }, { status: 403 });
    const reason = text(body.comment);
    if (!reason) return NextResponse.json({ error: "Kết luận đối chiếu là bắt buộc." }, { status: 400 });
    const { data: comparison } = await admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "COMPARED_WITH_SELF").maybeSingle();
    if (!comparison) return NextResponse.json({ error: "Chưa chọn đợt tự đánh giá để đối chiếu." }, { status: 409 });
    const { count: scores } = await admin.from("external_assessment_scores").select("id", { count: "exact", head: true }).eq("external_assessment_event_id", event.id);
    if (!scores) return NextResponse.json({ error: "Chưa nhập điểm đánh giá ngoài." }, { status: 409 });
    const { error } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_assessment_events", row_id: event.id, action_type: "EXTERNAL_ASSESSMENT_CLOSE_COMPARISON", old_value: { lifecycle_status: record.lifecycle_status }, new_value: { lifecycle_status: "CLOSED", compared_scores: scores }, reason, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã chốt kết quả đối chiếu đánh giá ngoài." });
  }

  return NextResponse.json({ error: "Thao tác đánh giá ngoài không hợp lệ." }, { status: 400 });
}
