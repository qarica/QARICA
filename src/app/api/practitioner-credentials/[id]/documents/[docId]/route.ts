import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id, docId } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: document } = await admin.from("practitioner_credential_documents").select("id,credential_id,organization_id").eq("id", docId).maybeSingle();
  if (!document || document.organization_id !== organizationId || document.credential_id !== id) {
    return NextResponse.json({ error: "Không tìm thấy văn bằng/chứng chỉ hoặc ngoài phạm vi truy cập." }, { status: 404 });
  }

  const { error } = await admin.from("practitioner_credential_documents").delete().eq("id", docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credential_documents",
    row_id: docId,
    action_type: "PRACTITIONER_CREDENTIAL_DOCUMENT_DELETE",
    old_value: document,
    reason: "Xoá văn bằng/chứng chỉ/quyết định bổ sung phạm vi khỏi hồ sơ hành nghề.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true });
}
