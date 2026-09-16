import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateFmeaRpn, normalizeFmeaFailureMode, normalizeFmeaStep, normalizedFmeaText, validFmeaScore } from "@/lib/fmea-setup";

const text = (value: unknown) => String(value ?? "").trim();

async function context(recordId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "fmea.manage" });
  if (!allowed) return { ok: false as const, response: NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 }) };
  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: study }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "FMEA").maybeSingle(),
    admin.from("fmea_studies").select("id,workflow_status,method").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !study) {
    return { ok: false as const, response: NextResponse.json({ error: "Hồ sơ FMEA không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 }) };
  }
  return { ok: true as const, admin, user: auth.user, study, record };
}

async function insertCompatible(admin: ReturnType<typeof createAdminClient>, table: string, candidates: Record<string, unknown>[]) {
  let lastError = "Không ghi được dữ liệu FMEA.";
  for (const payload of candidates) {
    const { data, error } = await admin.from(table).insert(payload).select("*").single();
    if (!error && data) return { data, error: null as string | null };
    lastError = error?.message || lastError;
    const schemaMismatch = error?.code === "PGRST204" || error?.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(error?.message || "");
    if (!schemaMismatch) break;
  }
  return { data: null, error: lastError };
}

async function snapshot(admin: ReturnType<typeof createAdminClient>, studyId: string) {
  const { data: rawSteps, error: stepError } = await admin.from("fmea_process_steps").select("*").eq("fmea_study_id", studyId);
  if (stepError) throw stepError;
  const steps = (rawSteps ?? []).map((row, index) => normalizeFmeaStep(row, index)).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  const stepIds = steps.map((step) => step.id).filter(Boolean);
  const { data: rawModes, error: modeError } = stepIds.length
    ? await admin.from("fmea_failure_modes").select("*").in("process_step_id", stepIds)
    : { data: [], error: null };
  if (modeError) throw modeError;
  const modes = (rawModes ?? []).map((row, index) => normalizeFmeaFailureMode(row, index)).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  return { steps, modes };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  try {
    const data = await snapshot(ctx.admin, ctx.study.id);
    return NextResponse.json({ ...data, workflow_status: ctx.study.workflow_status, method: ctx.study.method });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được dữ liệu FMEA." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const editable = ["DRAFT", "IN_PROGRESS"].includes(ctx.study.workflow_status);
  if (!editable) return NextResponse.json({ error: "Chỉ được bổ sung phân tích khi FMEA còn Nháp hoặc đang triển khai." }, { status: 409 });

  if (action === "ADD_STEP") {
    const label = text(body.label);
    const description = text(body.description);
    if (!label) return NextResponse.json({ error: "Tên bước quy trình là bắt buộc." }, { status: 400 });
    const current = await snapshot(ctx.admin, ctx.study.id);
    if (current.steps.some((step) => normalizedFmeaText(step.label) === normalizedFmeaText(label))) return NextResponse.json({ error: "Bước quy trình này đã tồn tại." }, { status: 409 });
    const order = current.steps.length ? Math.max(...current.steps.map((step) => Number(step.order) || 0)) + 1 : 1;
    const base = { fmea_study_id: ctx.study.id };
    const result = await insertCompatible(ctx.admin, "fmea_process_steps", [
      { ...base, sequence_no: order, step_name: label, step_description: description || null },
      { ...base, step_no: order, step_name: label, description: description || null },
      { ...base, step_order: order, name: label, description: description || null },
      { ...base, sort_order: order, process_step: label, description: description || null },
    ]);
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
    await ctx.admin.from("audit_logs").insert({ actor_user_id: ctx.user.id, record_id: recordId, table_name: "fmea_process_steps", row_id: result.data.id, action_type: "FMEA_PROCESS_STEP_ADD", new_value: { label, description: description || null, order }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã thêm bước quy trình." });
  }

  if (action === "ADD_MODE") {
    const processStepId = text(body.process_step_id);
    const label = text(body.label);
    const effect = text(body.effect);
    const cause = text(body.cause);
    const control = text(body.control);
    const severity = validFmeaScore(body.severity);
    const occurrence = validFmeaScore(body.occurrence);
    const detection = validFmeaScore(body.detection);
    if (!processStepId || !label) return NextResponse.json({ error: "Cần chọn bước quy trình và nhập failure mode." }, { status: 400 });
    if (severity === null || occurrence === null || detection === null) return NextResponse.json({ error: "Điểm Severity, Occurrence và Detection phải là số nguyên từ 1 đến 10." }, { status: 400 });
    const current = await snapshot(ctx.admin, ctx.study.id);
    if (!current.steps.some((step) => step.id === processStepId)) return NextResponse.json({ error: "Bước quy trình không thuộc hồ sơ FMEA này." }, { status: 400 });
    if (current.modes.some((mode) => mode.process_step_id === processStepId && normalizedFmeaText(mode.label) === normalizedFmeaText(label))) return NextResponse.json({ error: "Failure mode này đã tồn tại trong bước đã chọn." }, { status: 409 });
    const order = current.modes.filter((mode) => mode.process_step_id === processStepId).length + 1;
    const rpn = calculateFmeaRpn(severity, occurrence, detection);
    const highPriority = body.is_high_priority === true;
    const base = { process_step_id: processStepId, is_high_priority: highPriority };
    const result = await insertCompatible(ctx.admin, "fmea_failure_modes", [
      { ...base, sequence_no: order, failure_mode: label, potential_effect: effect || null, potential_cause: cause || null, current_controls: control || null, severity_score: severity, occurrence_score: occurrence, detection_score: detection, rpn },
      { ...base, mode_no: order, failure_mode_description: label, potential_effect: effect || null, potential_cause: cause || null, current_controls: control || null, severity: severity, occurrence: occurrence, detection: detection, rpn },
      { ...base, sort_order: order, mode_name: label, effect: effect || null, cause: cause || null, current_control: control || null, severity, occurrence, detection, risk_priority_number: rpn },
      { ...base, sort_order: order, name: label, effects: effect || null, causes: cause || null, controls: control || null, s_score: severity, o_score: occurrence, d_score: detection, risk_score: rpn },
    ]);
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
    await ctx.admin.from("audit_logs").insert({ actor_user_id: ctx.user.id, record_id: recordId, table_name: "fmea_failure_modes", row_id: result.data.id, action_type: "FMEA_FAILURE_MODE_ADD", new_value: { process_step_id: processStepId, label, effect: effect || null, cause: cause || null, control: control || null, severity, occurrence, detection, rpn, is_high_priority: highPriority }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: `Đã thêm failure mode. RPN = ${rpn}.` });
  }

  return NextResponse.json({ error: "Thao tác thiết lập FMEA không hợp lệ." }, { status: 400 });
}
