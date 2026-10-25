import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,incoming_document_id,title,description,lead_user_id,collaborating_user_ids,due_date,completed_at,created_by,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();

async function loadTask(admin: ReturnType<typeof createAdminClient>, id: string, taskId: string, organizationId: string) {
  return admin
    .from("incoming_document_tasks")
    .select("id,incoming_document_id,title,description,lead_user_id,collaborating_user_ids,due_date,completed_at,created_by,created_at,updated_at,organization_id")
    .eq("id", taskId)
    .eq("incoming_document_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const { id, taskId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await loadTask(admin, id, taskId, organizationId);
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = clean(body.title);
    if (!title) return NextResponse.json({ error: "Nội dung công việc không được để trống." }, { status: 400 });
    update.title = title;
  }
  if (body.description !== undefined) update.description = clean(body.description) || null;
  if (body.due_date !== undefined) {
    const dueDate = clean(body.due_date);
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return NextResponse.json({ error: "Hạn hoàn thành không hợp lệ." }, { status: 400 });
    update.due_date = dueDate || null;
  }
  if (body.completed_at !== undefined) update.completed_at = clean(body.completed_at) || null;

  if (body.lead_user_id !== undefined || body.collaborating_user_ids !== undefined) {
    const leadUserId = body.lead_user_id !== undefined ? clean(body.lead_user_id) : current.lead_user_id;
    if (!leadUserId) return NextResponse.json({ error: "Chủ trì là bắt buộc." }, { status: 400 });
    const rawCollaborators = body.collaborating_user_ids !== undefined
      ? (Array.isArray(body.collaborating_user_ids) ? body.collaborating_user_ids : [])
      : current.collaborating_user_ids;
    const collaboratingUserIds = Array.from(new Set((rawCollaborators as unknown[]).map((v) => clean(v)).filter(Boolean))).filter((v) => v !== leadUserId);
    const candidateIds = Array.from(new Set([leadUserId, ...collaboratingUserIds]));
    const { data: validProfiles, error: profilesError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("user_id", candidateIds);
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 400 });
    if ((validProfiles?.length || 0) !== candidateIds.length) return NextResponse.json({ error: "Chủ trì hoặc người phối hợp không hợp lệ." }, { status: 400 });
    update.lead_user_id = leadUserId;
    update.collaborating_user_ids = collaboratingUserIds;
  }

  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("incoming_document_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_document_tasks",
    row_id: taskId,
    action_type: "INCOMING_DOCUMENT_TASK_UPDATE",
    old_value: current,
    new_value: update,
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, task: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const { id, taskId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await loadTask(admin, id, taskId, organizationId);
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy công việc." }, { status: 404 });

  const { error } = await admin.from("incoming_document_tasks").delete().eq("id", taskId).eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_document_tasks",
    row_id: taskId,
    action_type: "INCOMING_DOCUMENT_TASK_DELETE",
    old_value: current,
    reason: "Xoá công việc tạo nhầm.",
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã xoá nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
