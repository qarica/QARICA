import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_FILE_BUCKET } from "@/lib/document-publication-file";

export const runtime = "nodejs";

// Xem/tải file của MỘT phiên bản cũ trong lịch sử (file được lưu lại khi văn bản
// phát hành phiên bản mới). Chỉ cần .view như xem file hiện hành; chặn theo tổ
// chức VÀ theo văn bản (versionId phải thuộc đúng văn bản :id) trước khi ký link
// ngắn hạn — không tin id trần từ client.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const { id, versionId } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: version, error: versionError } = await admin
    .from("document_publication_versions")
    .select("id,file_path,file_name,document_publication_id,organization_id")
    .eq("id", versionId)
    .eq("document_publication_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 400 });
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản." }, { status: 404 });
  if (!version.file_path) return NextResponse.json({ error: "Phiên bản này không có file lưu lại." }, { status: 404 });

  const { data: signed, error: signError } = await admin.storage.from(DOCUMENT_FILE_BUCKET).createSignedUrl(version.file_path, 60);
  if (signError || !signed) return NextResponse.json({ error: signError?.message || "Không tạo được liên kết xem file." }, { status: 400 });

  return NextResponse.json({ ok: true, url: signed.signedUrl, file_name: version.file_name || "tep-dinh-kem" });
}
