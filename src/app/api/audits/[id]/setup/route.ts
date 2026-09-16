import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value || "").trim();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission_code: "audit.manage" });
  if (!allowed) return NextResponse.json({ error: "Bạn chưa có quyền quản lý Audit/Tracer." }, { status: 403 });
  const { id: recordId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = text(body.action).toUpperCase();
  const admin = createAdminClient();
  const [{ data: caller }, { data: record }, { data: audit }] = await Promise.all([
    admin.from("profiles").select("organization_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
    admin.from("records").select("id,organization_id,lifecycle_status").eq("id", recordId).eq("record_type", "AUDIT").maybeSingle(),
    admin.from("audits").select("id,workflow_status").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!caller?.is_active || !caller.organization_id || !record || record.organization_id !== caller.organization_id || record.lifecycle_status !== "ACTIVE" || !audit) return NextResponse.json({ error: "Hồ sơ Audit không thuộc phạm vi bệnh viện hiện tại hoặc đã đóng." }, { status: 403 });
  const departmentId = text(body.department_id) || null;
  if (departmentId) {
    const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle();
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }
  if (action === "ADD_SCOPE") {
    if (audit.workflow_status !== "DRAFT") return NextResponse.json({ error: "Chỉ được thêm phạm vi khi Audit còn ở trạng thái Nháp." }, { status: 409 });
    const processName = text(body.process_name), areaName = text(body.area_name), description = text(body.scope_description);
    if (!departmentId && !processName && !areaName && !description) return NextResponse.json({ error: "Cần nhập ít nhất khoa/phòng, quy trình, khu vực hoặc mô tả phạm vi." }, { status: 400 });
    let duplicate = admin.from("audit_scopes").select("id").eq("audit_id", audit.id).eq("process_name", processName || "").eq("area_name", areaName || "");
    duplicate = departmentId ? duplicate.eq("department_id", departmentId) : duplicate.is("department_id", null);
    const { data: existing } = await duplicate.limit(1).maybeSingle();
    if (existing) return NextResponse.json({ error: "Phạm vi này đã có trong Audit." }, { status: 409 });
    const { data, error } = await admin.from("audit_scopes").insert({ audit_id: audit.id, department_id: departmentId, process_name: processName || null, area_name: areaName || null, scope_description: description || null }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "audit_scopes", row_id: data.id, action_type: "AUDIT_SCOPE_ADD", new_value: { department_id: departmentId, process_name: processName, area_name: areaName, scope_description: description }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã thêm phạm vi Audit." });
  }
  if (action === "ADD_SESSION") {
    if (audit.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ được tạo phiên khi Audit đang thực hiện." }, { status: 409 });
    const start = text(body.scheduled_start), end = text(body.scheduled_end), location = text(body.location);
    if (!start) return NextResponse.json({ error: "Thời gian bắt đầu phiên Audit là bắt buộc." }, { status: 400 });
    if (end && new Date(end).getTime() <= new Date(start).getTime()) return NextResponse.json({ error: "Thời gian kết thúc phải sau thời gian bắt đầu." }, { status: 400 });
    const { data: existing } = await admin.from("audit_sessions").select("id").eq("audit_id", audit.id).eq("scheduled_start", new Date(start).toISOString()).limit(1).maybeSingle();
    if (existing) return NextResponse.json({ error: "Đã có phiên Audit bắt đầu tại thời điểm này." }, { status: 409 });
    const { data, error } = await admin.from("audit_sessions").insert({ audit_id: audit.id, scheduled_start: new Date(start).toISOString(), scheduled_end: end ? new Date(end).toISOString() : null, department_id: departmentId, location: location || null, session_status: "PLANNED" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: auth.user.id, record_id: recordId, table_name: "audit_sessions", row_id: data.id, action_type: "AUDIT_SESSION_ADD", new_value: { scheduled_start: start, scheduled_end: end || null, department_id: departmentId, location: location || null }, request_meta: { source: "qlcl-ui" } });
    return NextResponse.json({ ok: true, message: "Đã tạo phiên Audit." });
  }
  return NextResponse.json({ error: "Thao tác thiết lập Audit không hợp lệ." }, { status: 400 });
}
