import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

const ADD_STEP_RPC = "qlcl_add_fmea_step_v1";
const ADD_MODE_RPC = "qlcl_add_fmea_mode_v1";
const text = (value: unknown) => String(value || "").trim();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "risk.manage" });
  if (!allowed) {
    return NextResponse.json({ error: "Bạn chưa có quyền quản lý FMEA/HFMEA." }, { status: 403 });
  }

  const { id: recordId } = await params;
  const { data: record } = await supabase
    .from("records")
    .select("id,lifecycle_status")
    .eq("id", recordId)
    .eq("record_type", "FMEA")
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: "Không tìm thấy FMEA hoặc ngoài phạm vi truy cập." }, { status: 404 });
  }
  if (record.lifecycle_status !== "ACTIVE") {
    return NextResponse.json({ error: "FMEA không còn hoạt động." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const admin = createAdminClient();

  if (action === "ADD_STEP") {
    const sequenceNo = Number(body.step_no);
    const stepName = text(body.step_name);
    const description = text(body.description) || null;
    const responsibleDepartmentId = text(body.responsible_department_id) || null;

    if (!Number.isInteger(sequenceNo) || sequenceNo < 1 || !stepName) {
      return NextResponse.json({ error: "Số thứ tự và tên bước quy trình là bắt buộc." }, { status: 400 });
    }

    const { data: tx, error: txError } = await admin.rpc(ADD_STEP_RPC, {
      p_fmea_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_sequence_no: sequenceNo,
      p_step_name: stepName,
      p_description: description,
      p_responsible_department_id: responsibleDepartmentId,
    });

    if (txError) {
      const message = rpcErrorMessage(txError, "Không thêm được bước quy trình.");
      return NextResponse.json(
        { error: message },
        { status: /không|chỉ được|đã tồn tại|bắt buộc|phạm vi tổ chức/i.test(message) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: tx?.id,
      sequence_no: tx?.sequence_no ?? sequenceNo,
      message: "Đã thêm bước quy trình.",
      transaction: "atomic",
    });
  }

  if (action === "ADD_MODE") {
    const processStepId = text(body.process_step_id);
    const failureMode = text(body.failure_mode);
    const effect = text(body.potential_effect) || null;
    const cause = text(body.potential_cause) || null;
    const currentControl = text(body.current_control) || null;
    const high = body.is_high_priority === true;

    if (!processStepId || !failureMode) {
      return NextResponse.json({ error: "Bước quy trình và failure mode là bắt buộc." }, { status: 400 });
    }

    const { data: tx, error: txError } = await admin.rpc(ADD_MODE_RPC, {
      p_fmea_record_id: recordId,
      p_actor_user_id: auth.user.id,
      p_process_step_id: processStepId,
      p_failure_mode: failureMode,
      p_effect: effect,
      p_cause: cause,
      p_current_control: currentControl,
      p_is_high_priority: high,
    });

    if (txError) {
      const message = rpcErrorMessage(txError, "Không thêm được failure mode.");
      return NextResponse.json(
        { error: message },
        { status: /không|chỉ được|đã tồn tại|bắt buộc|phạm vi tổ chức/i.test(message) ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: tx?.id,
      message: "Đã thêm failure mode.",
      transaction: "atomic",
    });
  }

  return NextResponse.json({ error: "Thao tác thiết lập FMEA không hợp lệ." }, { status: 400 });
}
