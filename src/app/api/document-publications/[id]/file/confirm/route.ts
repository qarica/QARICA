import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_ALLOWED_EXTENSIONS, evidenceFilePolicy } from "@/lib/evidence-file-policy";
import {
  DOCUMENT_FILE_BUCKET,
  DOCUMENT_FILE_MAX_SIZE,
  finalizeDocumentFileAttach,
  isDocumentFilePathFor,
  loadDocumentForFile,
  safeFileName,
} from "@/lib/document-publication-file";

export const runtime = "nodejs";

// Bước 3 của đính kèm "tải thẳng lên storage" (xem ../upload-url): trình duyệt
// đã tải file lên đường dẫn do server cấp; route này KIỂM LẠI trên chính object
// trong storage (không tin số liệu client khai) rồi mới gắn vào văn bản — cùng
// phần ghi DB + audit_logs với đính kèm qua server (finalizeDocumentFileAttach).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: doc, error: docError } = await loadDocumentForFile(admin, id);
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 });
  if (!doc || doc.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const path = String(body.path || "");
  const originalFileName = String(body.file_name || "").trim();
  if (!originalFileName) return NextResponse.json({ error: "Vui lòng chọn file." }, { status: 400 });
  const filePolicy = evidenceFilePolicy(originalFileName);
  if (!filePolicy) {
    return NextResponse.json({ error: `Loại file không được phép. Chỉ chấp nhận: ${EVIDENCE_ALLOWED_EXTENSIONS.join(", ")}.` }, { status: 400 });
  }
  // Chỉ nhận đường dẫn đúng khuôn do chính route upload-url sinh ra cho văn bản + tổ chức này.
  if (!isDocumentFilePathFor(path, organizationId, id) || !path.endsWith(`-${safeFileName(originalFileName)}`)) {
    return NextResponse.json({ error: "Đường dẫn file không hợp lệ." }, { status: 400 });
  }
  // Gọi lại xác nhận cho đúng file đang gắn (bấm đúp/gửi lại): không làm gì, và
  // đặc biệt KHÔNG xoá "file cũ" — vì file cũ chính là file này.
  if (doc.file_path === path) return NextResponse.json({ ok: true, file_name: originalFileName });

  const { data: info, error: infoError } = await admin.storage.from(DOCUMENT_FILE_BUCKET).info(path);
  if (infoError || !info) return NextResponse.json({ error: "Chưa thấy file đã tải lên. Vui lòng thử đính kèm lại." }, { status: 400 });

  const actualSize = Number(info.size);
  const actualMime = String(info.contentType || "").split(";")[0].trim().toLowerCase();
  const expectedMime = filePolicy.mimeType.split(";")[0].trim().toLowerCase();
  if (!Number.isFinite(actualSize) || actualSize <= 0 || actualSize > DOCUMENT_FILE_MAX_SIZE || actualMime !== expectedMime) {
    // File không đạt kiểm tra thật → xoá khỏi storage, không để object lạ nằm lại.
    await admin.storage.from(DOCUMENT_FILE_BUCKET).remove([path]);
    const reason = actualSize > DOCUMENT_FILE_MAX_SIZE ? "Dung lượng file tối đa là 25 MB." : "File tải lên không khớp loại file cho phép.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const finalized = await finalizeDocumentFileAttach(admin, { actorUserId: auth.user.id, documentId: id, previousPath: doc.file_path, storagePath: path, originalFileName });
  if (!finalized.ok) return NextResponse.json({ error: finalized.error }, { status: finalized.status });

  return NextResponse.json({ ok: true, file_name: originalFileName });
}
