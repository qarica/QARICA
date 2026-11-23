import { randomUUID } from "crypto";
import type { createAdminClient } from "./supabase/admin";
import { DOCUMENT_FILE_BUCKET } from "./document-publication-file-limits";

export { DOCUMENT_FILE_BUCKET, DOCUMENT_FILE_MAX_SIZE } from "./document-publication-file-limits";

type Admin = ReturnType<typeof createAdminClient>;

export function safeFileName(name: string) {
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
export function departmentFolderSlug(name: string | null) {
  const slug = safeFileName(name || "");
  return slug === "tep-dinh-kem" ? "chung" : slug;
}

export async function loadDocumentForFile(admin: Admin, id: string) {
  return admin.from("document_publications").select("id,organization_id,drafting_department_id,file_path,file_name").eq("id", id).maybeSingle();
}

export async function draftingDepartmentName(admin: Admin, departmentId: string | null) {
  if (!departmentId) return null;
  const { data: department } = await admin.from("departments").select("name").eq("id", departmentId).maybeSingle();
  return department?.name ?? null;
}

// MỘT nơi duy nhất quyết định đường dẫn storage của file văn bản (route đính
// kèm trực tiếp qua server và route xin đường dẫn tải thẳng đều dùng chung).
export function buildDocumentFilePath(organizationId: string, departmentName: string | null, documentId: string, originalFileName: string) {
  return `${organizationId}/document-publications/${departmentFolderSlug(departmentName)}/${documentId}/${randomUUID()}-${safeFileName(originalFileName)}`;
}

// Route xác nhận nhận `path` từ client — chỉ chấp nhận đúng khuôn đường dẫn
// do buildDocumentFilePath sinh ra cho CHÍNH tổ chức + văn bản này, không tin
// chuỗi trần (chặn đính file của văn bản/tổ chức khác hoặc đường dẫn lạ).
export function isDocumentFilePathFor(path: string, organizationId: string, documentId: string) {
  if (typeof path !== "string" || path.includes("..")) return false;
  const parts = path.split("/");
  return (
    parts.length === 5 &&
    parts[0] === organizationId &&
    parts[1] === "document-publications" &&
    /^[A-Za-z0-9._-]+$/.test(parts[2]) &&
    parts[3] === documentId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+$/.test(parts[4])
  );
}

type FinalizeResult = { ok: true } | { ok: false; status: number; error: string };

// Phần ghi DB sau khi file đã nằm trong storage: gắn vào văn bản, xoá file cũ
// (không để object orphan khi thay file), ghi audit_logs.
export async function finalizeDocumentFileAttach(
  admin: Admin,
  args: { actorUserId: string; documentId: string; previousPath: string | null; storagePath: string; originalFileName: string },
): Promise<FinalizeResult> {
  const { actorUserId, documentId, previousPath, storagePath, originalFileName } = args;
  const { error: updateError } = await admin.from("document_publications").update({ file_path: storagePath, file_name: originalFileName, updated_at: new Date().toISOString() }).eq("id", documentId);
  if (updateError) {
    await admin.storage.from(DOCUMENT_FILE_BUCKET).remove([storagePath]);
    return { ok: false, status: 400, error: updateError.message };
  }
  if (previousPath) await admin.storage.from(DOCUMENT_FILE_BUCKET).remove([previousPath]);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    table_name: "document_publications",
    row_id: documentId,
    action_type: "DOCUMENT_PUBLICATION_FILE_UPLOAD",
    new_value: { file_name: originalFileName },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return { ok: false, status: 500, error: `Đã tải lên nhưng không ghi được audit trail: ${auditError.message}` };
  return { ok: true };
}
