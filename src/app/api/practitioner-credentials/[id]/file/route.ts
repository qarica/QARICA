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

async function loadCredential(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("practitioner_credentials").select("id,organization_id,decision_status,decision_file_path").eq("id", id).maybeSingle();
  return { data, error };
}

// Thay file đính kèm (upload mới hoặc xoá) khi hồ sơ đang "Đã ký" làm mất
// hiệu lực xác minh cũ — đúng tinh thần gate của emr_rollout_items: xác minh
// chỉ còn đúng cho ĐÚNG file đã xác minh, không tự động chuyển sang file mới.
function revertVerificationPatch(credential: { decision_status: string }) {
  if (credential.decision_status !== "DA_KY") return {};
  return { decision_status: "DA_SOAN", decision_verified_at: null, decision_verified_by: null };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: credential, error: credentialError } = await loadCredential(admin, id);
  if (credentialError) return NextResponse.json({ error: credentialError.message }, { status: 400 });
  if (!credential || credential.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });

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
  const storagePath = `${organizationId}/practitioner-credentials/${id}/${randomUUID()}-${storedFileName}`;
  const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: filePolicy.mimeType, upsert: false });
  if (uploadError) return NextResponse.json({ error: `Không tải được file: ${uploadError.message}` }, { status: 400 });

  const previousPath = credential.decision_file_path;
  const { error: updateError } = await admin
    .from("practitioner_credentials")
    .update({ decision_file_path: storagePath, decision_file_name: originalFileName, updated_by: auth.user.id, updated_at: new Date().toISOString(), ...revertVerificationPatch(credential) })
    .eq("id", id);
  if (updateError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (previousPath) await admin.storage.from(BUCKET).remove([previousPath]);

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credentials",
    row_id: id,
    action_type: "PRACTITIONER_CREDENTIAL_FILE_UPLOAD",
    new_value: { file_name: originalFileName },
    reason: "Đính kèm file quyết định phân công.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, file_name: originalFileName });
}

// Liên kết xem/tải có hạn ngắn, cùng mẫu với /api/evidence/[id]/download và
// /api/emr/items/[id]/file — không lưu URL dài hạn.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: credential, error: credentialError } = await admin.from("practitioner_credentials").select("id,organization_id,decision_file_path,decision_file_name").eq("id", id).maybeSingle();
  if (credentialError) return NextResponse.json({ error: credentialError.message }, { status: 400 });
  if (!credential || credential.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });
  if (!credential.decision_file_path) return NextResponse.json({ error: "Hồ sơ này chưa có file đính kèm." }, { status: 404 });

  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(credential.decision_file_path, 60);
  if (signError || !signed) return NextResponse.json({ error: signError?.message || "Không tạo được liên kết xem file." }, { status: 400 });

  return NextResponse.json({ ok: true, url: signed.signedUrl, file_name: credential.decision_file_name || "tep-dinh-kem" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: credential, error: credentialError } = await loadCredential(admin, id);
  if (credentialError) return NextResponse.json({ error: credentialError.message }, { status: 400 });
  if (!credential || credential.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const { error: updateError } = await admin
    .from("practitioner_credentials")
    .update({ decision_file_path: null, decision_file_name: null, updated_by: auth.user.id, updated_at: new Date().toISOString(), ...revertVerificationPatch(credential) })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  if (credential.decision_file_path) await admin.storage.from(BUCKET).remove([credential.decision_file_path]);

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credentials",
    row_id: id,
    action_type: "PRACTITIONER_CREDENTIAL_FILE_REMOVE",
    old_value: { file_name: credential.decision_file_path },
    reason: "Xoá file quyết định phân công đính kèm.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true });
}
