import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(["exe", "msi", "dll", "com", "scr", "bat", "cmd", "ps1", "sh", "js", "jar"]);

function safeFileName(name: string) {
  const trimmed = name.trim() || "minh-chung";
  const cleaned = trimmed.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "minh-chung").slice(-150);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("evidence.upload");
  if (!auth.ok) return auth.response;
  const { id: recordId } = await params;
  const formData = await request.formData();
  const fileValue = formData.get("file");
  const requestedTitle = String(formData.get("title") || "").trim();

  if (!(fileValue instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file minh chứng." }, { status: 400 });
  if (fileValue.size <= 0) return NextResponse.json({ error: "File minh chứng đang trống." }, { status: 400 });
  if (fileValue.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa là 25 MB." }, { status: 400 });

  const originalFileName = fileValue.name || "minh-chung";
  const extension = originalFileName.includes(".") ? originalFileName.split(".").pop()?.toLowerCase() || "" : "";
  if (extension && BLOCKED_EXTENSIONS.has(extension)) return NextResponse.json({ error: "Loại file này không được phép tải lên hệ thống." }, { status: 400 });

  const { data: visibleRecord, error: visibleError } = await auth.supabase
    .from("records")
    .select("id,organization_id,record_type,lifecycle_status,owner_department_id,title")
    .eq("id", recordId)
    .maybeSingle();
  if (visibleError || !visibleRecord) return NextResponse.json({ error: visibleError?.message || "Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập." }, { status: 404 });
  if (visibleRecord.lifecycle_status !== "ACTIVE") return NextResponse.json({ error: "Chỉ được bổ sung minh chứng khi hồ sơ đang hoạt động." }, { status: 409 });

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("user_id,organization_id,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (callerError || !caller?.organization_id || !caller.is_active) return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn bệnh viện." }, { status: 403 });
  if (caller.organization_id !== visibleRecord.organization_id) return NextResponse.json({ error: "Hồ sơ không thuộc bệnh viện hiện tại." }, { status: 403 });

  const evidenceId = randomUUID();
  const storedFileName = safeFileName(originalFileName);
  const storageBucket = "qlcl-evidence";
  const storagePath = `${caller.organization_id}/${recordId}/${evidenceId}/${storedFileName}`;
  const title = requestedTitle || originalFileName;
  const mimeType = fileValue.type || "application/octet-stream";

  // Không ép validity_status tại thời điểm upload. DB production đang dùng enum riêng và
  // sẽ tự áp default hợp lệ. Trạng thái rà soát chỉ được thay đổi bởi workflow review.
  const { error: metadataError } = await admin.from("evidence").insert({
    id: evidenceId,
    organization_id: caller.organization_id,
    title,
    evidence_type: "FILE",
    original_file_name: originalFileName,
    stored_file_name: storedFileName,
    mime_type: mimeType,
    file_size: fileValue.size,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    owner_department_id: visibleRecord.owner_department_id,
    uploaded_by: auth.user.id,
  });
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 });

  const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(storageBucket).upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });
  if (uploadError) {
    await admin.from("evidence").delete().eq("id", evidenceId);
    return NextResponse.json({ error: `Không tải được file minh chứng: ${uploadError.message}` }, { status: 400 });
  }

  const { error: linkError } = await admin.from("evidence_links").insert({ evidence_id: evidenceId, record_id: recordId, linked_by: auth.user.id });
  if (linkError) {
    await admin.storage.from(storageBucket).remove([storagePath]);
    await admin.from("evidence").delete().eq("id", evidenceId);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, evidence_id: evidenceId, title, file_name: originalFileName });
}
