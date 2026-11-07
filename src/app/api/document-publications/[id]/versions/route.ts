import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// "Khi phát hành phiên bản mới phải có lịch sử chứ" — lịch sử các phiên bản
// đã từng phát hành của 1 văn bản (ghi nhận append-only ở
// recordDocumentVersion(), gọi từ POST direct_publish / PATCH ADVANCE→
// PUBLISHED / PATCH EDIT khi đã PUBLISHED). Chỉ cần .view vì đây là xem,
// không phải thao tác kiểm soát.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: document, error: documentError } = await admin
    .from("document_publications")
    .select("id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 400 });
  if (!document) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const { data, error } = await admin
    .from("document_publication_versions")
    .select("id,version_label,document_code,effective_date,file_name,created_by,created_at")
    .eq("document_publication_id", id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, versions: data ?? [] });
}
