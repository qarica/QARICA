import { NextResponse } from "next/server";
import { lifecyclePermissionFor } from "@/lib/record-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingRpcFunction, rpcErrorMessage } from "@/lib/rpc-compat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIFECYCLE_RPC = "qlcl_change_record_lifecycle_v1";

async function resolveRecordId(supabase: Awaited<ReturnType<typeof createClient>>, pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts.at(-1) || "";
  if (!UUID_RE.test(last)) return null;

  if (parts[0] === "plans" && parts.length === 2) {
    const { data } = await supabase.from("work_programs").select("record_id").eq("id", last).maybeSingle();
    return data?.record_id || null;
  }
  if (parts[0] === "monitoring" && parts.length === 2) {
    const { data } = await supabase.from("monitoring_rounds").select("record_id").eq("id", last).maybeSingle();
    return data?.record_id || null;
  }
  return last;
}

async function getRecordAndPermission(supabase: Awaited<ReturnType<typeof createClient>>, recordId: string) {
  const { data: record, error } = await supabase
    .from("records")
    .select("id,organization_id,record_type,record_code,title,lifecycle_status,closed_at")
    .eq("id", recordId)
    .maybeSingle();
  if (error || !record) return { record: null, canManage: false, permission: null };

  const permission = lifecyclePermissionFor(record.record_type);
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: permission });
  return { record, canManage: !!allowed, permission };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const pathname = new URL(request.url).searchParams.get("path") || "";
  const recordId = await resolveRecordId(supabase, pathname);
  if (!recordId) return NextResponse.json({ record: null });
  const result = await getRecordAndPermission(supabase, recordId);
  return NextResponse.json(result);
}

const CHILD_CANCEL: Record<string, { table: string; status: string }> = {
  ACTION: { table: "actions", status: "CANCELLED" },
  PROGRAM: { table: "work_programs", status: "CANCELLED" },
  REPORT: { table: "reporting_obligations", status: "CANCELLED" },
  MONITORING: { table: "monitoring_rounds", status: "CANCELLED" },
  FINDING: { table: "findings", status: "CANCELLED" },
  CAPA: { table: "capas", status: "CANCELLED" },
  INCIDENT: { table: "incidents", status: "CANCELLED" },
  AUDIT: { table: "audits", status: "CANCELLED" },
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const recordId = String(body.recordId || "");
  const action = String(body.action || "").toUpperCase();
  const reason = String(body.reason || "").trim();
  if (!UUID_RE.test(recordId)) return NextResponse.json({ error: "ID hồ sơ không hợp lệ." }, { status: 400 });
  if (!["CANCEL", "ARCHIVE"].includes(action)) return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  if (reason.length < 3) return NextResponse.json({ error: "Vui lòng nhập lý do rõ ràng trước khi thực hiện." }, { status: 400 });

  const { record, canManage, permission } = await getRecordAndPermission(supabase, recordId);
  if (!record) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (!canManage) return NextResponse.json({ error: `Bạn chưa được cấp quyền ${permission || "quản lý hồ sơ"}.` }, { status: 403 });

  const { data: caller } = await supabase.from("profiles").select("organization_id,is_active").eq("user_id", user.id).maybeSingle();
  if (!caller?.is_active || !caller.organization_id || caller.organization_id !== record.organization_id) return NextResponse.json({ error: "Tài khoản hoặc phạm vi bệnh viện không hợp lệ." }, { status: 403 });

  if (action === "CANCEL" && ["CANCELLED", "ARCHIVED", "RETIRED", "INACTIVE"].includes(record.lifecycle_status)) return NextResponse.json({ error: "Hồ sơ này đã ngưng hoạt động nên không thể hủy lại." }, { status: 409 });
  if (action === "CANCEL" && record.lifecycle_status === "CLOSED") return NextResponse.json({ error: "Hồ sơ đã đóng. Nếu cần loại khỏi danh sách vận hành, hãy dùng Lưu trữ." }, { status: 409 });
  if (action === "ARCHIVE" && record.lifecycle_status === "ARCHIVED") return NextResponse.json({ ok: true, status: "ARCHIVED", transaction: "idempotent" });

  const targetStatus = action === "CANCEL" ? "CANCELLED" : "ARCHIVED";
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: tx, error: txError } = await admin.rpc(LIFECYCLE_RPC, {
    p_record_id: record.id,
    p_actor_user_id: user.id,
    p_action: action,
    p_reason: reason,
  });
  if (!txError) return NextResponse.json({ ok: true, status: targetStatus, transaction: "atomic", result: tx });
  if (!isMissingRpcFunction(txError, LIFECYCLE_RPC)) {
    const txMessage = rpcErrorMessage(txError, "Không thể cập nhật vòng đời hồ sơ.");
    return NextResponse.json({ error: txMessage }, { status: /already inactive|closed record|invalid|required|not found/i.test(txMessage) ? 409 : 400 });
  }

  // Backward-compatible fallback before migration exists.
  let childTouched = false;
  let childPreviousStatus: string | null = null;
  let childTable: string | null = null;
  if (action === "CANCEL") {
    const child = CHILD_CANCEL[record.record_type];
    if (child) {
      childTable = child.table;
      const { data: currentChild } = await admin.from(child.table).select("workflow_status").eq("record_id", record.id).maybeSingle();
      childPreviousStatus = currentChild?.workflow_status ?? null;
      const { error: childError } = await admin.from(child.table).update({ workflow_status: child.status, updated_at: now }).eq("record_id", record.id);
      if (childError) return NextResponse.json({ error: `Không thể hủy workflow liên quan: ${childError.message}` }, { status: 400 });
      childTouched = true;
    }
  } else if (record.record_type === "PROGRAM") {
    childTable = "work_programs";
    const { data: currentChild } = await admin.from("work_programs").select("workflow_status").eq("record_id", record.id).maybeSingle();
    childPreviousStatus = currentChild?.workflow_status ?? null;
    const { error: childError } = await admin.from("work_programs").update({ workflow_status: "ARCHIVED", updated_at: now }).eq("record_id", record.id);
    if (childError) return NextResponse.json({ error: `Không thể lưu trữ kế hoạch: ${childError.message}` }, { status: 400 });
    childTouched = true;
  }

  const { data: updated, error: updateError } = await admin.from("records").update({ lifecycle_status: targetStatus, closed_at: action === "CANCEL" ? now : record.closed_at, updated_at: now }).eq("id", record.id).select("id,lifecycle_status").maybeSingle();
  if (updateError || !updated) {
    if (childTouched && childTable && childPreviousStatus) await admin.from(childTable).update({ workflow_status: childPreviousStatus, updated_at: now }).eq("record_id", record.id);
    return NextResponse.json({ error: updateError?.message || "Không cập nhật được hồ sơ." }, { status: 400 });
  }

  const { data: history, error: historyError } = await admin.from("record_status_history").insert({ record_id: record.id, old_status: record.lifecycle_status, new_status: targetStatus, changed_by: user.id, reason }).select("id").single();
  if (historyError || !history) {
    await admin.from("records").update({ lifecycle_status: record.lifecycle_status, closed_at: record.closed_at, updated_at: now }).eq("id", record.id);
    if (childTouched && childTable && childPreviousStatus) await admin.from(childTable).update({ workflow_status: childPreviousStatus, updated_at: now }).eq("record_id", record.id);
    return NextResponse.json({ error: historyError?.message || "Không ghi được lịch sử trạng thái." }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({ actor_user_id: user.id, record_id: record.id, table_name: "records", row_id: record.id, action_type: action === "CANCEL" ? "CANCEL_RECORD" : "ARCHIVE_RECORD", old_value: { lifecycle_status: record.lifecycle_status }, new_value: { lifecycle_status: targetStatus }, reason, request_meta: { source: "qlcl-ui", record_type: record.record_type, transaction: "legacy-fallback" } });
  if (auditError) {
    await admin.from("record_status_history").delete().eq("id", history.id);
    await admin.from("records").update({ lifecycle_status: record.lifecycle_status, closed_at: record.closed_at, updated_at: now }).eq("id", record.id);
    if (childTouched && childTable && childPreviousStatus) await admin.from(childTable).update({ workflow_status: childPreviousStatus, updated_at: now }).eq("record_id", record.id);
    return NextResponse.json({ error: auditError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: targetStatus, transaction: "legacy-fallback" });
}
