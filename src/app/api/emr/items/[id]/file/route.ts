import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVIDENCE_ALLOWED_EXTENSIONS, evidenceFilePolicy } from "@/lib/evidence-file-policy";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const BUCKET = "qlcl-evidence";

function safeFileName(name: string) {
  const trimmed = name.trim() || "tep-dinh-kem";
  const cleaned = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "tep-dinh-kem").slice(-150);
}

async function loadItem(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("emr_rollout_items").select("id,organization_id,category,details").eq("id", id).maybeSingle();
  return { data, error };
}

// Upload a document (form template, scanned paper form, certificate, SOP...) and attach it
// to an existing EMR rollout item. Requires the item to already exist - matches the same
// "save first, then attach" pattern the rest of the app uses for evidence.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!caller?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: item, error: itemError } = await loadItem(admin, id);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });
  if (!item || item.organization_id !== caller.organization_id) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });

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

  const storedFileName = safeFileName(originalFileName);
  const storagePath = `${caller.organization_id}/emr/${item.category}/${id}/${randomUUID()}-${storedFileName}`;
  const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: filePolicy.mimeType, upsert: false });
  if (uploadError) return NextResponse.json({ error: `Không tải được file: ${uploadError.message}` }, { status: 400 });

  const nextDetails = { ...(item.details as Record<string, unknown> || {}), file_path: storagePath, file_name: originalFileName };
  const { error: updateError } = await admin.from("emr_rollout_items").update({ details: nextDetails, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, file_name: originalFileName });
}

// Fresh short-lived signed URL to view/download the attached file - matches the same
// pattern as /api/evidence/[id]/download (URLs are never stored long-lived).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!caller?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: item, error: itemError } = await loadItem(admin, id);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });
  if (!item || item.organization_id !== caller.organization_id) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });

  const storagePath = (item.details as Record<string, unknown> | null)?.file_path;
  if (!storagePath || typeof storagePath !== "string") return NextResponse.json({ error: "Mục này chưa có file đính kèm." }, { status: 404 });

  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (signError || !signed) return NextResponse.json({ error: signError?.message || "Không tạo được liên kết xem file." }, { status: 400 });

  return NextResponse.json({ ok: true, url: signed.signedUrl, file_name: (item.details as Record<string, unknown>)?.file_name || "tep-dinh-kem" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("emr.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin.from("profiles").select("organization_id").eq("user_id", auth.user.id).maybeSingle();
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!caller?.organization_id) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: item, error: itemError } = await loadItem(admin, id);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });
  if (!item || item.organization_id !== caller.organization_id) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });

  const storagePath = (item.details as Record<string, unknown> | null)?.file_path;
  const nextDetails = { ...(item.details as Record<string, unknown> || {}) };
  delete nextDetails.file_path;
  delete nextDetails.file_name;

  const { error: updateError } = await admin.from("emr_rollout_items").update({ details: nextDetails, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  if (storagePath && typeof storagePath === "string") await admin.storage.from(BUCKET).remove([storagePath]);

  return NextResponse.json({ ok: true });
}
