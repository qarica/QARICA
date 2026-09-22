import { NextResponse } from "next/server";
import { hasAuditScopeContent, hcmLocalInputToIso, validAuditSessionWindow } from "@/lib/audit-setup";
import { rpcErrorMessage } from "@/lib/rpc-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SCOPE_RPC = "qlcl_audit_scope_mutate_v1";
const SESSION_RPC = "qlcl_audit_session_mutate_v1";
const text = (value: unknown) => String(value || "").trim();

function rpcStatus(message: string) {
  return /duplicate|only be edited|only planned|not found|outside current organization|not active|required|invalid|must be|may only/i.test(message) ? 409 : 400;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const actorUserId = auth.user.id;

  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "audit.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý Audit/Tracer." }, { status: 403 });

  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const reason = text(body.reason) || null;
  const admin: any = createAdminClient();

  const [{ data: caller }, { data: record }, { data: audit }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", actorUserId).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "AUDIT").maybeSingle(),
    admin.from("audits").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);

  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !audit) {
    return NextResponse.json({ error: "Hồ sơ Audit không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });
  }

  const departmentId = text(body.department_id) || null;
  if (departmentId) {
    const { data: department } = await admin
      .from("departments")
      .select("id")
      .eq("id", departmentId)
      .eq("organization_id", caller.organization_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  if (["ADD_SCOPE", "UPDATE_SCOPE", "DELETE_SCOPE"].includes(action)) {
    if (audit.workflow_status !== "DRAFT") {
      return NextResponse.json({ error: "Chỉ được sửa phạm vi khi Audit còn ở trạng thái Nháp." }, { status: 409 });
    }

    const scopeId = text(body.scope_id) || null;
    const rpcAction = action.replace("_SCOPE", "");

    if (action === "DELETE_SCOPE") {
      if (!scopeId) return NextResponse.json({ error: "Thiếu phạm vi cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa phạm vi để truy vết." }, { status: 400 });
    }

    const processName = text(body.process_name);
    const areaName = text(body.area_name);
    const description = text(body.scope_description);
    if (action !== "DELETE_SCOPE" && !hasAuditScopeContent({ departmentId, processName, areaName, description })) {
      return NextResponse.json({ error: "Cần nhập ít nhất khoa/phòng, quy trình, khu vực hoặc mô tả phạm vi." }, { status: 400 });
    }

    const { data: tx, error } = await admin.rpc(SCOPE_RPC, {
      p_audit_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_action: rpcAction,
      p_scope_id: scopeId,
      p_department_id: departmentId,
      p_process_name: processName || null,
      p_area_name: areaName || null,
      p_scope_description: description || null,
      p_reason: reason,
    });

    if (error) {
      const message = rpcErrorMessage(error, "Không thể cập nhật phạm vi Audit.");
      return NextResponse.json({ error: message }, { status: rpcStatus(message) });
    }

    const message =
      action === "ADD_SCOPE" ? "Đã thêm phạm vi Audit." :
      action === "UPDATE_SCOPE" ? "Đã cập nhật phạm vi Audit và lưu audit trail." :
      "Đã xóa phạm vi nhập nhầm và lưu audit trail.";

    return NextResponse.json({ ok: true, message, transaction: "atomic", result: tx });
  }

  if (["ADD_SESSION", "UPDATE_SESSION", "DELETE_SESSION"].includes(action)) {
    if (audit.workflow_status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Chỉ được chỉnh phiên khi Audit đang thực hiện." }, { status: 409 });
    }

    const sessionId = text(body.session_id) || null;
    const rpcAction = action.replace("_SESSION", "");

    if (action === "DELETE_SESSION") {
      if (!sessionId) return NextResponse.json({ error: "Thiếu phiên Audit cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa phiên Audit để truy vết." }, { status: 400 });
    }

    let startIso: string | null = null;
    let endIso: string | null = null;
    const location = text(body.location);

    if (action !== "DELETE_SESSION") {
      const start = text(body.scheduled_start);
      const end = text(body.scheduled_end);
      if (!validAuditSessionWindow(start, end)) {
        return NextResponse.json({ error: !start ? "Thời gian bắt đầu phiên Audit là bắt buộc." : "Thời gian kết thúc phải sau thời gian bắt đầu." }, { status: 400 });
      }
      startIso = hcmLocalInputToIso(start);
      endIso = end ? hcmLocalInputToIso(end) : null;
      if (!startIso || (end && !endIso)) return NextResponse.json({ error: "Thời gian phiên Audit không hợp lệ." }, { status: 400 });
    }

    const { data: tx, error } = await admin.rpc(SESSION_RPC, {
      p_audit_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_action: rpcAction,
      p_session_id: sessionId,
      p_department_id: departmentId,
      p_scheduled_start: startIso,
      p_scheduled_end: endIso,
      p_location: location || null,
      p_reason: reason,
    });

    if (error) {
      const message = rpcErrorMessage(error, "Không thể cập nhật phiên Audit.");
      return NextResponse.json({ error: message }, { status: rpcStatus(message) });
    }

    const message =
      action === "ADD_SESSION" ? "Đã tạo phiên Audit." :
      action === "UPDATE_SESSION" ? "Đã cập nhật phiên Audit và lưu audit trail." :
      "Đã xóa phiên PLANNED nhập nhầm và lưu audit trail.";

    return NextResponse.json({ ok: true, message, transaction: "atomic", result: tx });
  }

  return NextResponse.json({ error: "Thao tác thiết lập Audit không hợp lệ." }, { status: 400 });
}
