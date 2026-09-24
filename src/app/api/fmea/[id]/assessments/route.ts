import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const SCORE_RPC = "qlcl_score_fmea_mode_v1";

async function context(recordId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };

  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .eq("record_type", "FMEA")
    .maybeSingle();

  if (!record) {
    return { error: NextResponse.json({ error: "Không tìm thấy FMEA hoặc ngoài phạm vi truy cập." }, { status: 404 }) };
  }

  const admin: any = createAdminClient();
  const { data: study } = await admin
    .from("fmea_studies")
    .select("id,workflow_status,scoring_model_version_id")
    .eq("record_id", recordId)
    .maybeSingle();

  if (!study) {
    return { error: NextResponse.json({ error: "Không tìm thấy nghiên cứu FMEA." }, { status: 404 }) };
  }

  const { data: steps } = await admin
    .from("fmea_process_steps")
    .select("id")
    .eq("fmea_study_id", study.id);

  const stepIds = (steps ?? []).map((row: any) => row.id);
  const { data: modes } = stepIds.length
    ? await admin
        .from("fmea_failure_modes")
        .select("id,failure_mode,is_high_priority")
        .in("process_step_id", stepIds)
    : { data: [] as any[] };

  return { supabase, admin, user: auth.user, record, study, modes: modes ?? [] };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const c: any = await context(id);
  if (c.error) return c.error;

  const modeIds = c.modes.map((row: any) => row.id);
  const { data, error } = modeIds.length
    ? await c.admin
        .from("fmea_mode_assessments")
        .select("id,failure_mode_id,assessment_type,severity,occurrence,detection,rpn,rationale,assessed_at")
        .in("failure_mode_id", modeIds)
        .order("assessed_at", { ascending: false })
    : { data: [], error: null };

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ available: true, modes: c.modes, assessments: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const c: any = await context(id);
  if (c.error) return c.error;

  const { data: allowed } = await c.supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) {
    return NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 });
  }

  const body: any = await request.json().catch(() => ({}));
  const modeId = String(body.failure_mode_id || "").trim();
  const type = String(body.assessment_type || "").toUpperCase();
  const severity = Number(body.severity);
  const occurrence = Number(body.occurrence);
  const detection = Number(body.detection);
  const rationale = String(body.rationale || "").trim() || null;

  if (!c.modes.some((row: any) => row.id === modeId)) {
    return NextResponse.json({ error: "Failure mode không thuộc FMEA này." }, { status: 400 });
  }
  if (!["BASELINE", "RESIDUAL"].includes(type)) {
    return NextResponse.json({ error: "Loại đánh giá không hợp lệ." }, { status: 400 });
  }
  if (![severity, occurrence, detection].every((value) => Number.isInteger(value) && value >= 1 && value <= 10)) {
    return NextResponse.json({ error: "Severity, Occurrence và Detection phải từ 1 đến 10." }, { status: 400 });
  }

  const { data: tx, error: txError } = await c.admin.rpc(SCORE_RPC, {
    p_fmea_record_id: id,
    p_actor_user_id: c.user.id,
    p_failure_mode_id: modeId,
    p_assessment_type: type,
    p_severity: severity,
    p_occurrence: occurrence,
    p_detection: detection,
    p_rationale: rationale,
  });

  if (txError) {
    const message = rpcErrorMessage(txError, "Không lưu được điểm FMEA.");
    return NextResponse.json(
      { error: message },
      { status: /không|chưa|phải từ|baseline|residual|failure mode|ngoài phạm vi/i.test(message) ? 409 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: tx?.id,
    rpn: tx?.rpn,
    assessed_at: tx?.assessed_at,
    assessment_type: tx?.assessment_type ?? type,
    transaction: "atomic",
  });
}
