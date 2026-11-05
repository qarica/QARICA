import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id,credential_id,document_type,title,specialization,document_no,issued_at,issued_by,note,created_at";
const DOCUMENT_TYPES = new Set(["DEGREE", "SPECIALIST_DEGREE", "CERTIFICATE", "SCOPE_ADJUSTMENT"]);
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

async function loadCredential(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin.from("practitioner_credentials").select("id,organization_id").eq("id", id).maybeSingle();
  return data;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const credential = await loadCredential(admin, id);
  if (!credential || credential.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const documentType = clean(body.document_type);
  if (!DOCUMENT_TYPES.has(documentType)) return NextResponse.json({ error: "Loại văn bằng/chứng chỉ không hợp lệ." }, { status: 400 });
  const title = clean(body.title);
  if (!title) return NextResponse.json({ error: "Tên văn bằng/chứng chỉ/quyết định là bắt buộc." }, { status: 400 });

  const { data, error } = await admin
    .from("practitioner_credential_documents")
    .insert({
      organization_id: organizationId,
      credential_id: id,
      document_type: documentType,
      title,
      specialization: clean(body.specialization) || null,
      document_no: clean(body.document_no) || null,
      issued_at: dateOrNull(body.issued_at),
      issued_by: clean(body.issued_by) || null,
      note: clean(body.note) || null,
    })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credential_documents",
    row_id: data.id,
    action_type: "PRACTITIONER_CREDENTIAL_DOCUMENT_CREATE",
    new_value: data,
    reason: "Thêm văn bằng/chứng chỉ/quyết định bổ sung phạm vi vào hồ sơ hành nghề.",
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, document: data });
}
