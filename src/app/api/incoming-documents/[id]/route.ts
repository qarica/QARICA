import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,received_at,received_no,document_date,document_no,issuing_authority,summary,document_type,director_note,department_id,deployed_at,due_date,completed_at,completion_note,progress_feedback";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("incoming_documents")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy công văn." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  // Bút phê + triển khai xuống đơn vị + thời hạn — ghi cùng lúc, không phải
  // approve/reject nhị phân, đúng với thực tế "Bút phê của GĐ" trong sổ theo dõi.
  if (body.director_note !== undefined) update.director_note = String(body.director_note).trim() || null;
  if (body.department_id !== undefined) {
    const departmentId = body.department_id ? String(body.department_id) : null;
    if (departmentId) {
      const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
      if (!department) return NextResponse.json({ error: "Khoa/phòng được giao không hợp lệ." }, { status: 400 });
    }
    update.department_id = departmentId;
  }
  if (body.deployed_at !== undefined) update.deployed_at = body.deployed_at || null;
  if (body.due_date !== undefined) update.due_date = body.due_date || null;
  // Theo dõi hoàn thành
  if (body.completed_at !== undefined) update.completed_at = body.completed_at || null;
  if (body.completion_note !== undefined) update.completion_note = String(body.completion_note).trim() || null;
  if (body.progress_feedback !== undefined) update.progress_feedback = String(body.progress_feedback).trim() || null;

  if (!Object.keys(update).length) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("incoming_documents")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy công văn." }, { status: 404 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_documents",
    row_id: id,
    action_type: "INCOMING_DOCUMENT_UPDATE",
    old_value: current,
    new_value: update,
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, document: data });
}

// Xoá công văn khai báo nhầm — không có vòng đời phê duyệt riêng (chỉ bút phê
// + triển khai + theo dõi hoàn thành ghi tự do), nên không cần gate theo
// trạng thái như document_publications; chỉ cần đúng quyền .manage + đúng tổ chức.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("incoming_documents")
    .select("id,received_no,issuing_authority,summary")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy công văn." }, { status: 404 });

  const { error } = await admin.from("incoming_documents").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_documents",
    row_id: id,
    action_type: "INCOMING_DOCUMENT_DELETE",
    old_value: current,
    reason: "Xoá công văn khai báo nhầm.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true });
}
