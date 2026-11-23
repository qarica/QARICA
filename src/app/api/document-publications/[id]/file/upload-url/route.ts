import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_ALLOWED_EXTENSIONS, evidenceFilePolicy } from "@/lib/evidence-file-policy";
import {
  DOCUMENT_FILE_BUCKET,
  DOCUMENT_FILE_MAX_SIZE,
  buildDocumentFilePath,
  draftingDepartmentName,
  loadDocumentForFile,
} from "@/lib/document-publication-file";

export const runtime = "nodejs";

// Bước 1 của đính kèm "tải thẳng lên storage": file lớn (vài MB trở lên) gửi
// qua route Vercel bị chặn ở giới hạn body của nền tảng, nên trình duyệt tải
// thẳng lên Supabase bằng đường dẫn có chữ ký một lần. Route này CHỈ cấp đường
// dẫn — kiểm tra quyền (.manage), tổ chức của văn bản, loại file và dung lượng
// khai báo; không ghi gì vào DB. Dung lượng/mime thật được kiểm lại ở bước xác
// nhận (../confirm) vì số khai báo từ client không đáng tin.
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
  const fileName = String(body.file_name || "").trim();
  const size = Number(body.size);
  if (!fileName) return NextResponse.json({ error: "Vui lòng chọn file." }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "File đang trống." }, { status: 400 });
  if (size > DOCUMENT_FILE_MAX_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa là 25 MB." }, { status: 400 });
  const filePolicy = evidenceFilePolicy(fileName);
  if (!filePolicy) {
    return NextResponse.json({ error: `Loại file không được phép. Chỉ chấp nhận: ${EVIDENCE_ALLOWED_EXTENSIONS.join(", ")}.` }, { status: 400 });
  }

  const departmentName = await draftingDepartmentName(admin, doc.drafting_department_id);
  const storagePath = buildDocumentFilePath(organizationId, departmentName, id, fileName);
  const { data, error } = await admin.storage.from(DOCUMENT_FILE_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) return NextResponse.json({ error: `Không tạo được đường dẫn tải lên: ${error?.message || "lỗi không xác định"}` }, { status: 400 });

  return NextResponse.json({ ok: true, path: data.path, token: data.token, content_type: filePolicy.mimeType });
}
