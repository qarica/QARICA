import { NextResponse } from "next/server";
import { canCancelIncident, lifecyclePermissionFor } from "@/lib/record-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/rpc-compat";

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

async function getRecordAndPermission(supabase: Awaited<ReturnType<typeof createClient>>, recordId: string, userId: string) {
  const { data: record, error } = await supabase
    .from("records")
    .select("id,organization_id,record_type,record_code,title,lifecycle_status,closed_at")
    .eq("id", recordId)
    .maybeSingle();
  if (error || !record) return { record: null, canManage: false, permission: null };

  const permission = lifecyclePermissionFor(record.record_type);
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: permission });
  if (record.record_type !== "INCIDENT") return { record, canManage: !!allowed, permission };

  const [{ data: canTriage }, { data: incident }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.triage" }),
    supabase.from("incidents").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);
  let isReporter = false;
  if (incident?.id) {
    const { data: ownReport } = await supabase
      .from("incident_reports")
      .select("id")
      .eq("incident_id", incident.id)
      .eq("reporter_user_id", userId)
      .limit(1)
      .maybeSingle();
    isReporter = !!ownReport;
  }
  const canManage = canCancelIncident({
    hasClosePermission: !!allowed,
    hasTriagePermission: !!canTriage,
    isReporter,
    workflowStatus: incident?.workflow_status,
  });
  return { record, canManage, permission: canManage ? null : "incident.report/incident.triage/incident.close" };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const pathname = new URL(request.url).searchParams.get("path") || "";
  const recordId = await resolveRecordId(supabase, pathname);
  if (!recordId) return NextResponse.json({ record: null });
  const result = await getRecordAndPermission(supabase, recordId, user.id);
  return NextResponse.json(result);
}

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

  const { record, canManage, permission } = await getRecordAndPermission(supabase, recordId, user.id);
  if (!record) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (!canManage) return NextResponse.json({ error: `Bạn chưa được cấp quyền ${permission || "quản lý hồ sơ"}.` }, { status: 403 });

  const { data: caller } = await supabase.from("profiles").select("organization_id,is_active").eq("user_id", user.id).maybeSingle();
  if (!caller?.is_active || !caller.organization_id || caller.organization_id !== record.organization_id) return NextResponse.json({ error: "Tài khoản hoặc phạm vi bệnh viện không hợp lệ." }, { status: 403 });

  if (action === "CANCEL" && ["CANCELLED", "ARCHIVED", "RETIRED", "INACTIVE"].includes(record.lifecycle_status)) return NextResponse.json({ error: "Hồ sơ này đã ngưng hoạt động nên không thể hủy lại." }, { status: 409 });
  if (action === "CANCEL" && record.lifecycle_status === "CLOSED") return NextResponse.json({ error: "Hồ sơ đã đóng. Nếu cần loại khỏi danh sách vận hành, hãy dùng Lưu trữ." }, { status: 409 });
  if (action === "ARCHIVE" && record.lifecycle_status === "ARCHIVED") return NextResponse.json({ ok: true, status: "ARCHIVED", transaction: "idempotent" });

  const targetStatus = action === "CANCEL" ? "CANCELLED" : "ARCHIVED";
  const admin = createAdminClient();

  const { data: tx, error: txError } = await admin.rpc(LIFECYCLE_RPC, {
    p_record_id: record.id,
    p_actor_user_id: user.id,
    p_action: action,
    p_reason: reason,
  });
  if (!txError) return NextResponse.json({ ok: true, status: targetStatus, transaction: "atomic", result: tx });
  const txMessage = rpcErrorMessage(txError, "Không thể cập nhật vòng đời hồ sơ.");
  return NextResponse.json(
    { error: txMessage },
    { status: /đã ngưng|đã đóng|không hợp lệ|không tìm thấy|ngoài phạm vi|lý do/i.test(txMessage) ? 409 : 400 },
  );
}
