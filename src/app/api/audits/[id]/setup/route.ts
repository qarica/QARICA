import { NextResponse } from "next/server";
import { canEditAuditScope, canEditAuditSession, hasAuditScopeContent, hcmLocalInputToIso, validAuditSessionWindow } from "@/lib/audit-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value || "").trim();

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
    const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", caller.organization_id).eq("is_active", true).maybeSingle();
    if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
  }

  async function writeLog(input: { table: string; rowId: string; actionType: string; oldValue?: unknown; newValue?: unknown; fallbackReason?: string }) {
    return admin.from("audit_logs").insert({
      actor_user_id: actorUserId,
      record_id: recordId,
      table_name: input.table,
      row_id: input.rowId,
      action_type: input.actionType,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      reason: reason || input.fallbackReason || null,
      request_meta: { source: "qlcl-ui", audit_workflow_status: audit.workflow_status },
    });
  }

  if (["ADD_SCOPE", "UPDATE_SCOPE", "DELETE_SCOPE"].includes(action)) {
    if (!canEditAuditScope(audit.workflow_status)) return NextResponse.json({ error: "Chỉ được sửa phạm vi khi Audit còn ở trạng thái Nháp." }, { status: 409 });
    const scopeId = text(body.scope_id);

    if (action === "DELETE_SCOPE") {
      if (!scopeId) return NextResponse.json({ error: "Thiếu phạm vi cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa phạm vi để truy vết." }, { status: 400 });
      const { data: existing } = await admin.from("audit_scopes").select("id,audit_id,department_id,process_name,area_name,scope_description").eq("id", scopeId).eq("audit_id", audit.id).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Không tìm thấy phạm vi Audit." }, { status: 404 });
      const { error: deleteError } = await admin.from("audit_scopes").delete().eq("id", scopeId).eq("audit_id", audit.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: logError } = await writeLog({ table: "audit_scopes", rowId: scopeId, actionType: "AUDIT_SCOPE_DELETE", oldValue: existing });
      if (logError) {
        await admin.from("audit_scopes").insert(existing);
        return NextResponse.json({ error: `Không ghi được audit trail; thao tác xóa đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa phạm vi nhập nhầm và lưu audit trail." });
    }

    const processName = text(body.process_name), areaName = text(body.area_name), description = text(body.scope_description);
    if (!hasAuditScopeContent({ departmentId, processName, areaName, description })) return NextResponse.json({ error: "Cần nhập ít nhất khoa/phòng, quy trình, khu vực hoặc mô tả phạm vi." }, { status: 400 });
    let duplicate = admin.from("audit_scopes").select("id").eq("audit_id", audit.id).eq("process_name", processName || "").eq("area_name", areaName || "");
    duplicate = departmentId ? duplicate.eq("department_id", departmentId) : duplicate.is("department_id", null);
    if (action === "UPDATE_SCOPE" && scopeId) duplicate = duplicate.neq("id", scopeId);
    const { data: duplicateRow } = await duplicate.limit(1).maybeSingle();
    if (duplicateRow) return NextResponse.json({ error: "Phạm vi này đã có trong Audit." }, { status: 409 });
    const nextValue = { department_id: departmentId, process_name: processName || null, area_name: areaName || null, scope_description: description || null };

    if (action === "ADD_SCOPE") {
      const { data, error } = await admin.from("audit_scopes").insert({ audit_id: audit.id, ...nextValue }).select("id").single();
      if (error || !data) return NextResponse.json({ error: error?.message || "Không thêm được phạm vi Audit." }, { status: 400 });
      const { error: logError } = await writeLog({ table: "audit_scopes", rowId: data.id, actionType: "AUDIT_SCOPE_ADD", newValue: nextValue });
      if (logError) {
        await admin.from("audit_scopes").delete().eq("id", data.id);
        return NextResponse.json({ error: `Không ghi được audit trail; phạm vi mới đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã thêm phạm vi Audit." });
    }

    if (!scopeId) return NextResponse.json({ error: "Thiếu phạm vi cần sửa." }, { status: 400 });
    const { data: oldValue } = await admin.from("audit_scopes").select("id,department_id,process_name,area_name,scope_description").eq("id", scopeId).eq("audit_id", audit.id).maybeSingle();
    if (!oldValue) return NextResponse.json({ error: "Không tìm thấy phạm vi Audit." }, { status: 404 });
    const { error: updateError } = await admin.from("audit_scopes").update(nextValue).eq("id", scopeId).eq("audit_id", audit.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const { error: logError } = await writeLog({ table: "audit_scopes", rowId: scopeId, actionType: "AUDIT_SCOPE_UPDATE", oldValue, newValue: nextValue, fallbackReason: "Điều chỉnh phạm vi Audit khi còn nháp." });
    if (logError) {
      await admin.from("audit_scopes").update({ department_id: oldValue.department_id, process_name: oldValue.process_name, area_name: oldValue.area_name, scope_description: oldValue.scope_description }).eq("id", scopeId);
      return NextResponse.json({ error: `Không ghi được audit trail; thay đổi đã được hoàn tác. ${logError.message}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Đã cập nhật phạm vi Audit và lưu audit trail." });
  }

  if (["ADD_SESSION", "UPDATE_SESSION", "DELETE_SESSION"].includes(action)) {
    const sessionId = text(body.session_id);

    if (action === "DELETE_SESSION") {
      if (!sessionId) return NextResponse.json({ error: "Thiếu phiên Audit cần xóa." }, { status: 400 });
      if (!reason || reason.length < 3) return NextResponse.json({ error: "Cần nhập lý do xóa phiên Audit để truy vết." }, { status: 400 });
      const { data: existing } = await admin.from("audit_sessions").select("id,audit_id,scheduled_start,scheduled_end,department_id,location,session_status").eq("id", sessionId).eq("audit_id", audit.id).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Không tìm thấy phiên Audit." }, { status: 404 });
      if (!canEditAuditSession(audit.workflow_status, existing.session_status)) return NextResponse.json({ error: "Chỉ được xóa phiên còn PLANNED khi Audit đang thực hiện." }, { status: 409 });
      const { error: deleteError } = await admin.from("audit_sessions").delete().eq("id", sessionId).eq("audit_id", audit.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
      const { error: logError } = await writeLog({ table: "audit_sessions", rowId: sessionId, actionType: "AUDIT_SESSION_DELETE", oldValue: existing });
      if (logError) {
        await admin.from("audit_sessions").insert(existing);
        return NextResponse.json({ error: `Không ghi được audit trail; thao tác xóa đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã xóa phiên PLANNED nhập nhầm và lưu audit trail." });
    }

    const start = text(body.scheduled_start), end = text(body.scheduled_end), location = text(body.location);
    if (!validAuditSessionWindow(start, end)) return NextResponse.json({ error: !start ? "Thời gian bắt đầu phiên Audit là bắt buộc." : "Thời gian kết thúc phải sau thời gian bắt đầu." }, { status: 400 });
    const startIso = hcmLocalInputToIso(start);
    const endIso = end ? hcmLocalInputToIso(end) : null;
    if (!startIso || (end && !endIso)) return NextResponse.json({ error: "Thời gian phiên Audit không hợp lệ." }, { status: 400 });
    const nextValue = { scheduled_start: startIso, scheduled_end: endIso, department_id: departmentId, location: location || null };

    if (action === "ADD_SESSION") {
      if (audit.workflow_status !== "IN_PROGRESS") return NextResponse.json({ error: "Chỉ được tạo phiên khi Audit đang thực hiện." }, { status: 409 });
      const { data: duplicate } = await admin.from("audit_sessions").select("id").eq("audit_id", audit.id).eq("scheduled_start", startIso).limit(1).maybeSingle();
      if (duplicate) return NextResponse.json({ error: "Đã có phiên Audit bắt đầu tại thời điểm này." }, { status: 409 });
      const insertValue = { audit_id: audit.id, ...nextValue, session_status: "PLANNED" };
      const { data, error } = await admin.from("audit_sessions").insert(insertValue).select("id").single();
      if (error || !data) return NextResponse.json({ error: error?.message || "Không tạo được phiên Audit." }, { status: 400 });
      const { error: logError } = await writeLog({ table: "audit_sessions", rowId: data.id, actionType: "AUDIT_SESSION_ADD", newValue: insertValue });
      if (logError) {
        await admin.from("audit_sessions").delete().eq("id", data.id);
        return NextResponse.json({ error: `Không ghi được audit trail; phiên mới đã được hoàn tác. ${logError.message}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Đã tạo phiên Audit." });
    }

    if (!sessionId) return NextResponse.json({ error: "Thiếu phiên Audit cần sửa." }, { status: 400 });
    const { data: oldValue } = await admin.from("audit_sessions").select("id,scheduled_start,scheduled_end,department_id,location,session_status").eq("id", sessionId).eq("audit_id", audit.id).maybeSingle();
    if (!oldValue) return NextResponse.json({ error: "Không tìm thấy phiên Audit." }, { status: 404 });
    if (!canEditAuditSession(audit.workflow_status, oldValue.session_status)) return NextResponse.json({ error: "Chỉ được sửa phiên còn PLANNED khi Audit đang thực hiện." }, { status: 409 });
    const { data: duplicate } = await admin.from("audit_sessions").select("id").eq("audit_id", audit.id).eq("scheduled_start", startIso).neq("id", sessionId).limit(1).maybeSingle();
    if (duplicate) return NextResponse.json({ error: "Đã có phiên Audit khác bắt đầu tại thời điểm này." }, { status: 409 });
    const { error: updateError } = await admin.from("audit_sessions").update(nextValue).eq("id", sessionId).eq("audit_id", audit.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    const { error: logError } = await writeLog({ table: "audit_sessions", rowId: sessionId, actionType: "AUDIT_SESSION_UPDATE", oldValue, newValue: { ...nextValue, session_status: oldValue.session_status }, fallbackReason: "Điều chỉnh lịch phiên Audit còn PLANNED." });
    if (logError) {
      await admin.from("audit_sessions").update({ scheduled_start: oldValue.scheduled_start, scheduled_end: oldValue.scheduled_end, department_id: oldValue.department_id, location: oldValue.location }).eq("id", sessionId);
      return NextResponse.json({ error: `Không ghi được audit trail; thay đổi đã được hoàn tác. ${logError.message}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Đã cập nhật phiên Audit và lưu audit trail." });
  }

  return NextResponse.json({ error: "Thao tác thiết lập Audit không hợp lệ." }, { status: 400 });
}
