import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_ALLOWED_EXTENSIONS, evidenceFilePolicy } from "@/lib/evidence-file-policy";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const BUCKET = "qlcl-evidence";

function safeFileName(name: string) {
  const trimmed = name.trim() || "tep-dinh-kem";
  const cleaned = trimmed
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "tep-dinh-kem").slice(-150);
}

// Thư mục theo phòng ban trong storage — tái dùng chính logic làm sạch tên
// file ở trên (bỏ dấu, thay ký tự lạ) để tên khoa/phòng ra một thư mục hợp
// lệ, rơi về "chung" nếu khoa/phòng chưa có tên.
function departmentFolderSlug(name: string | null) {
  const slug = safeFileName(name || "");
  return slug === "tep-dinh-kem" ? "chung" : slug;
}

async function loadDocument(admin: ReturnType<typeof createAdminClient>, id: string) {
  return admin.from("document_publications").select("id,organization_id,drafting_department_id,file_path,file_name").eq("id", id).maybeSingle();
}

// Đính kèm file văn bản (bản scan/PDF/DOCX...) vào một văn bản đã có trong
// document_publications — "lưu trước, đính kèm sau" giống đúng quy ước file
// EMR (src/app/api/emr/items/[id]/file/route.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocument(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const formData = await request.formData();
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file." }, { status: 400 });
  if (fileValue.size <= 0) return NextResponse.json({ error: "File đang trống." }, { status: 400 });
  if (fileValue.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa là 25 MB." }, { status: 400 });

  const originalFileName = fileValue.name || "tep-dinh-kem";
  const filePolicy = evidenceFilePolicy(originalFileName);
  if (!filePolicy) {
    return NextResponse.json({ error: `Loại file không được phép. Chỉ chấp nhận: ${EVIDENCE_ALLOWED_EXTENSIONS.join(", ")}.` }, { status: 400 });
  }

  let draftingDepartmentName: string | null = null;
  if (doc.drafting_department_id) {
    const { data: department } = await admin.from("departments").select("name").eq("id", doc.drafting_department_id).maybeSingle();
    draftingDepartmentName = department?.name ?? null;
  }

  const storedFileName = safeFileName(originalFileName);
  const storagePath = `${organizationId}/document-publications/${departmentFolderSlug(draftingDepartmentName)}/${id}/${randomUUID()}-${storedFileName}`;
  const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: filePolicy.mimeType, upsert: false });
  if (uploadError) return NextResponse.json({ error: `Không tải được file: ${uploadError.message}` }, { status: 400 });

  const previousPath = doc.file_path;
  const { error: updateError } = await admin.from("document_publications").update({ file_path: storagePath, file_name: originalFileName, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (previousPath) await admin.storage.from(BUCKET).remove([previousPath]);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "document_publications",
    row_id: id,
    action_type: "DOCUMENT_PUBLICATION_FILE_UPLOAD",
    new_value: { file_name: originalFileName },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã tải lên nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, file_name: originalFileName });
}

// Link xem/tải file còn hiệu lực ngắn — không lưu URL dài hạn, giống đúng
// quy ước /api/evidence/[id]/download và /api/emr/items/[id]/file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocument(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });
  if (!doc.file_path) return NextResponse.json({ error: "Văn bản này chưa có file đính kèm." }, { status: 404 });

  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(doc.file_path, 60);
  if (signError || !signed) return NextResponse.json({ error: signError?.message || "Không tạo được liên kết xem file." }, { status: 400 });

  return NextResponse.json({ ok: true, url: signed.signedUrl, file_name: doc.file_name || "tep-dinh-kem" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocument(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const { error: updateError } = await admin.from("document_publications").update({ file_path: null, file_name: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  if (doc.file_path) await admin.storage.from(BUCKET).remove([doc.file_path]);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "document_publications",
    row_id: id,
    action_type: "DOCUMENT_PUBLICATION_FILE_REMOVE",
    old_value: { file_name: doc.file_name },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã xoá file nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
