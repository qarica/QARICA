import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS = "id,incoming_document_id,title,description,lead_user_id,collaborating_user_ids,due_date,completed_at,created_by,created_at,updated_at";
const clean = (value: unknown) => String(value ?? "").trim();

async function loadDocument(admin: ReturnType<typeof createAdminClient>, id: string) {
  return admin.from("incoming_documents").select("id,organization_id,summary").eq("id", id).maybeSingle();
}

// "Tạo công việc từ văn bản" — một người chủ trì (bắt buộc) + nhiều người
// phối hợp (không bắt buộc), liên kết trực tiếp với công văn đến. Bảng riêng
// (incoming_document_tasks), không đi qua cơ chế actions/records chung vì
// incoming_documents vốn là bảng độc lập ngoài Registry.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("incoming_documents.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocument(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy công văn." }, { status: 404 });

  const { data, error } = await admin
    .from("incoming_document_tasks")
    .select(SELECT_COLUMNS)
    .eq("incoming_document_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, tasks: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocument(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy công văn." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = clean(body.title);
  if (!title) return NextResponse.json({ error: "Nội dung công việc là bắt buộc." }, { status: 400 });
  const leadUserId = clean(body.lead_user_id);
  if (!leadUserId) return NextResponse.json({ error: "Chủ trì là bắt buộc." }, { status: 400 });

  const rawCollaborators = Array.isArray(body.collaborating_user_ids) ? body.collaborating_user_ids : [];
  const collaboratingUserIds = Array.from(new Set(rawCollaborators.map((v: unknown) => clean(v)).filter(Boolean))).filter((v) => v !== leadUserId);

  const candidateIds = Array.from(new Set([leadUserId, ...collaboratingUserIds]));
  const { data: validProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("user_id", candidateIds);
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 400 });
  if ((validProfiles?.length || 0) !== candidateIds.length) {
    return NextResponse.json({ error: "Chủ trì hoặc người phối hợp không hợp lệ." }, { status: 400 });
  }

  const dueDate = clean(body.due_date);
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return NextResponse.json({ error: "Hạn hoàn thành không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("incoming_document_tasks")
    .insert({
      organization_id: organizationId,
      incoming_document_id: id,
      title,
      description: clean(body.description) || null,
      lead_user_id: leadUserId,
      collaborating_user_ids: collaboratingUserIds,
      due_date: dueDate || null,
      created_by: auth.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_document_tasks",
    row_id: data.id,
    action_type: "INCOMING_DOCUMENT_TASK_CREATE",
    new_value: { incoming_document_id: id, title, lead_user_id: leadUserId, collaborating_user_ids: collaboratingUserIds },
    reason: `Tạo công việc từ công văn: ${doc.summary}`,
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã tạo nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, task: data });
}
