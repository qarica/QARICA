import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const EDITABLE = new Set(["DRAFT", "RETURNED"]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculate(type: string, numerator: number | null, denominator: number | null, raw: number | null, multiplier: number) {
  const normalized = type.toUpperCase();
  if (["RATE", "RATIO", "PERCENTAGE", "PROPORTION"].includes(normalized)) {
    if (numerator === null || denominator === null || denominator <= 0) throw new Error("Tử số và mẫu số lớn hơn 0 là bắt buộc cho công thức tỷ lệ.");
    return (numerator / denominator) * multiplier;
  }
  if (raw !== null) return raw;
  if (numerator !== null && denominator !== null && denominator > 0) return (numerator / denominator) * multiplier;
  if (numerator !== null) return numerator;
  throw new Error("Chưa có dữ liệu để tính kết quả chỉ số.");
}

function resultLevel(value: number, target: number | null, direction: string) {
  if (target === null) return "NOT_EVALUATED";
  const d = direction.toUpperCase();
  if (["LOWER_BETTER", "LOWER_IS_BETTER", "DECREASE"].includes(d)) return value <= target ? "MEETS_TARGET" : "OUT_OF_TARGET";
  if (["HIGHER_BETTER", "HIGHER_IS_BETTER", "INCREASE"].includes(d)) return value >= target ? "MEETS_TARGET" : "OUT_OF_TARGET";
  return value === target ? "MEETS_TARGET" : "OUT_OF_TARGET";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id: recordId } = await params;
  const body: any = await request.json().catch(() => ({}));
  const command = String(body.action || "").toUpperCase();
  const permission = command === "SAVE" || command === "SUBMIT" ? "indicators.enter" : "indicators.verify";
  const [{ data: allowed }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: permission }),
    supabase.rpc("has_permission", { p_permission_code: "indicators.manage" }),
  ]);
  if (!allowed && !canManage) return NextResponse.json({ error: "Bạn chưa có quyền thực hiện bước này." }, { status: 403 });
  const { data: visible } = await supabase.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "INDICATOR_MEASUREMENT").maybeSingle();
  if (!visible) return NextResponse.json({ error: "Không tìm thấy kỳ đo hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (visible.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Kỳ đo không còn hoạt động." }, { status: 409 });

  const admin: any = createAdminClient();
  const { data: measurement, error } = await admin.from("indicator_measurements").select("id,indicator_assignment_id,workflow_status,numerator_value,denominator_value,raw_value,calculated_value,result_level").eq("record_id", recordId).maybeSingle();
  if (error || !measurement) return NextResponse.json({ error: error?.message || "Không tìm thấy dữ liệu kỳ đo." }, { status: 404 });
  const oldStatus = String(measurement.workflow_status || "DRAFT");
  const now = new Date().toISOString();
  let newStatus = oldStatus;
  let reason = String(body.comment || "").trim() || null;
  let changes: Record<string, unknown> = {};

  if (command === "SAVE" || command === "SUBMIT") {
    if (!EDITABLE.has(oldStatus)) return NextResponse.json({ error: "Chỉ kỳ đo Nháp hoặc Bị trả lại mới được sửa/gửi." }, { status: 409 });
    const { data: assignment } = await admin.from("indicator_assignments").select("indicator_version_id,local_target,status").eq("id", measurement.indicator_assignment_id).maybeSingle();
    if (!assignment || assignment.status !== "ACTIVE") return NextResponse.json({ error: "Phân công chỉ số không còn hiệu lực." }, { status: 409 });
    const { data: version } = await admin.from("indicator_definition_versions").select("calculation_type,multiplier,desired_direction,status").eq("id", assignment.indicator_version_id).maybeSingle();
    if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản công thức chỉ số." }, { status: 409 });
    const numerator = numberOrNull(body.numerator_value);
    const denominator = numberOrNull(body.denominator_value);
    const raw = numberOrNull(body.raw_value);
    let calculated: number;
    try { calculated = calculate(String(version.calculation_type || "RAW"), numerator, denominator, raw, Number(version.multiplier || 1)); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không tính được kết quả." }, { status: 400 }); }
    if (numerator !== null && numerator < 0 || denominator !== null && denominator < 0 || raw !== null && raw < 0) return NextResponse.json({ error: "Dữ liệu chỉ số không được là số âm." }, { status: 400 });
    const level = resultLevel(calculated, numberOrNull(assignment.local_target), String(version.desired_direction || ""));
    newStatus = command === "SUBMIT" ? "SUBMITTED" : oldStatus;
    changes = { numerator_value: numerator, denominator_value: denominator, raw_value: raw, calculated_value: calculated, result_level: level, workflow_status: newStatus, submitted_at: command === "SUBMIT" ? now : null, verified_at: null, locked_at: null, updated_at: now };
    if (command === "SUBMIT") reason = reason || "Gửi dữ liệu chỉ số để xác minh.";
  } else if (command === "VERIFY") {
    if (oldStatus !== "SUBMITTED") return NextResponse.json({ error: "Chỉ dữ liệu đã gửi mới được xác minh." }, { status: 409 });
    newStatus = "VERIFIED"; changes = { workflow_status: newStatus, verified_at: now, verified_by: auth.user.id, updated_at: now };
    reason = reason || "Dữ liệu và công thức đã được xác minh.";
  } else if (command === "RETURN") {
    if (oldStatus !== "SUBMITTED") return NextResponse.json({ error: "Chỉ dữ liệu đang chờ xác minh mới được trả lại." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Lý do trả lại là bắt buộc." }, { status: 400 });
    newStatus = "RETURNED"; changes = { workflow_status: newStatus, verified_at: null, locked_at: null, updated_at: now };
  } else if (command === "LOCK") {
    if (oldStatus !== "VERIFIED") return NextResponse.json({ error: "Chỉ dữ liệu đã xác minh mới được khóa." }, { status: 409 });
    newStatus = "LOCKED"; changes = { workflow_status: newStatus, locked_at: now, locked_by: auth.user.id, updated_at: now };
    reason = reason || "Khóa kỳ đo sau xác minh; mọi điều chỉnh tiếp theo phải có lịch sử và giải trình.";
  } else return NextResponse.json({ error: "Thao tác chỉ số không hợp lệ." }, { status: 400 });

  const { error: updateError } = await admin.from("indicator_measurements").update(changes).eq("id", measurement.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "indicator_measurements", row_id: measurement.id, action_type: `INDICATOR_${command}`, old_value: { workflow_status: oldStatus, calculated_value: measurement.calculated_value, result_level: measurement.result_level }, new_value: { workflow_status: newStatus, calculated_value: changes.calculated_value ?? measurement.calculated_value, result_level: changes.result_level ?? measurement.result_level }, reason, request_meta: { source: "qlcl-ui" } });
  return NextResponse.json({ ok: true, status: newStatus, calculated_value: changes.calculated_value, result_level: changes.result_level, message: command === "RETURN" ? "Đã trả dữ liệu về người nhập." : command === "LOCK" ? "Đã khóa kỳ đo." : command === "VERIFY" ? "Đã xác minh dữ liệu." : command === "SUBMIT" ? "Đã gửi dữ liệu để xác minh." : "Đã lưu dữ liệu và tính lại kết quả." });
}
