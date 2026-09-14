import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { externalComparisonCloseGate } from "@/lib/quality-gates";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const text = (value: unknown) => String(value ?? "").trim();
const GAP_RPC = "qlcl_external_assessment_create_gap_finding_v1";

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

  if (command === "CREATE_GAP_FINDING") {
    const [{ data: comparison }, { data: existingLinks }] = await Promise.all([
      admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "COMPARED_WITH_SELF").maybeSingle(),
      admin.from("record_links").select("metadata").eq("source_record_id", recordId).eq("relation_type", "GENERATED_FINDING"),
    ]);
    if (!comparison) return NextResponse.json({ error: "Cần khóa đợt tự đánh giá đối chiếu trước." }, { status: 409 });
    const criterionRef = text(body.criterion_ref);
    const description = text(body.description);
    const selfScore = text(body.self_score);
    const externalScore = text(body.external_score);
    const dueDate = text(body.due_date);
    const severity = text(body.severity) || "MAJOR";
    if (!criterionRef || !description || !selfScore || !externalScore || !dueDate) return NextResponse.json({ error: "Cần đủ mã tiêu chí, hai mức đánh giá, mô tả chênh lệch và hạn xử lý." }, { status: 400 });
    const duplicate = (existingLinks ?? []).some((x: any) => String(x.metadata?.criterion_ref || "").toLowerCase() === criterionRef.toLowerCase());
    if (duplicate) return NextResponse.json({ error: "Tiêu chí này đã sinh Finding; hãy xử lý trên Finding hiện có." }, { status: 409 });

    const { data: tx, error: txError } = await admin.rpc(GAP_RPC, {
      p_external_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_criterion_ref: criterionRef,
      p_self_score: selfScore,
      p_external_score: externalScore,
      p_description: description,
      p_severity: severity,
      p_due_date: dueDate,
    });
    if (!txError) {
      const findingCode = typeof tx === "object" && tx && "finding_code" in tx ? String((tx as Record<string, unknown>).finding_code || "") : "";
      return NextResponse.json({ ok: true, transaction: "atomic", result: tx, message: findingCode ? `Đã tạo Finding ${findingCode}; kết quả tự đánh giá gốc không bị thay đổi.` : "Đã tạo Finding từ chênh lệch đánh giá ngoài." });
    }
    if (!isMissingRpcFunction(txError, GAP_RPC)) {
      const message = rpcErrorMessage(txError, "Không thể tạo Finding từ đánh giá ngoài.");
      return NextResponse.json({ error: message }, { status: /already|duplicate|not active|must be locked/i.test(message) ? 409 : 400 });
    }

    const { data: code, error: codeError } = await admin.rpc("next_record_code", { p_record_type: "FINDING", p_work_year: record.work_year });
    if (codeError || !code) return NextResponse.json({ error: codeError?.message || "Không cấp được mã Finding." }, { status: 400 });
    const title = `Chênh lệch ${criterionRef} từ ${record.record_code}`;
    const { data: findingRecord, error: recordError } = await admin.from("records").insert({ organization_id: record.organization_id, record_type: "FINDING", record_code: code, title, work_year: record.work_year, owner_department_id: record.owner_department_id, owner_user_id: record.owner_user_id, lifecycle_status: "ACTIVE", created_by: auth.user.id }).select("id").single();
    if (recordError || !findingRecord) return NextResponse.json({ error: recordError?.message || "Không tạo được Finding." }, { status: 400 });
    const findingDescription = `${description}\nTự đánh giá: ${selfScore}. Đánh giá ngoài: ${externalScore}.`;
    const { data: finding, error: findingError } = await admin.from("findings").insert({ record_id: findingRecord.id, finding_type: "EXTERNAL_ASSESSMENT_GAP", description: findingDescription, severity, lead_department_id: record.owner_department_id, owner_user_id: record.owner_user_id, identified_at: event.assessment_date ? `${event.assessment_date}T00:00:00+07:00` : now, due_date: dueDate, workflow_status: "OPEN" }).select("id").single();
    if (findingError || !finding) {
      await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", findingRecord.id);
      return NextResponse.json({ error: findingError?.message || "Không tạo được dữ liệu Finding." }, { status: 400 });
    }
    const metadata = { criterion_ref: criterionRef, self_score: selfScore, external_score: externalScore, finding_id: finding.id, self_record_id: comparison.target_record_id };
    const { error: linkError } = await admin.from("record_links").insert({ source_record_id: recordId, target_record_id: findingRecord.id, relation_type: "GENERATED_FINDING", metadata, created_by: auth.user.id });
    if (linkError) {
      await admin.from("findings").delete().eq("id", finding.id);
      await admin.from("records").update({ lifecycle_status: "ARCHIVED", updated_at: now }).eq("id", findingRecord.id);
      return NextResponse.json({ error: `Không tạo được liên kết Đánh giá ngoài → Finding: ${linkError.message}` }, { status: 400 });
    }
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_assessment_events", row_id: event.id, action_type: "EXTERNAL_ASSESSMENT_CREATE_GAP_FINDING", new_value: metadata, reason: description, request_meta: { source: "qlcl-ui", transaction: "legacy-fallback" } });
    return NextResponse.json({ ok: true, transaction: "legacy-fallback", message: `Đã tạo Finding ${code}; kết quả tự đánh giá gốc không bị thay đổi.` });
  }

  if (command === "CLOSE_COMPARISON") {
    if (!manage) return NextResponse.json({ error: "Chỉ người quản lý bộ tiêu chí được chốt đối chiếu." }, { status: 403 });
    const reason = text(body.comment);
    if (!reason) return NextResponse.json({ error: "Kết luận đối chiếu là bắt buộc." }, { status: 400 });
    const [{ data: comparison }, { data: links }, { count: evidence }] = await Promise.all([
      admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "COMPARED_WITH_SELF").maybeSingle(),
      admin.from("record_links").select("target_record_id").eq("source_record_id", recordId).eq("relation_type", "GENERATED_FINDING"),
      admin.from("evidence_links").select("id", { count: "exact", head: true }).eq("record_id", recordId),
    ]);
    const ids = (links ?? []).map((x: any) => x.target_record_id).filter(Boolean);
    const { data: findings } = ids.length ? await admin.from("findings").select("workflow_status").in("record_id", ids) : { data: [] as any[] };
    const open = (findings ?? []).filter((x: any) => !["CLOSED", "CANCELLED"].includes(String(x.workflow_status))).length;
    const gate = externalComparisonCloseGate({ hasComparison: !!comparison, evidenceCount: evidence ?? 0, openFindingCount: open });
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });
    const { error } = await admin.from("records").update({ lifecycle_status: "CLOSED", closed_at: now, updated_at: now }).eq("id", recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("record_status_history").insert({ record_id: recordId, old_status: record.lifecycle_status, new_status: "CLOSED", changed_by: auth.user.id, reason });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "external_assessment_events", row_id: event.id, action_type: "EXTERNAL_ASSESSMENT_CLOSE_COMPARISON", old_value: { lifecycle_status: record.lifecycle_status }, new_value: { lifecycle_status: "CLOSED" }, reason, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã chốt đối chiếu sau khi hoàn tất Finding và minh chứng." });
  }

  return NextResponse.json({ error: "Thao tác đánh giá ngoài không hợp lệ." }, { status: 400 });
}
