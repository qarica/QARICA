import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT_COLUMNS =
  "id,received_at,received_no,document_date,document_no,issuing_authority,summary,document_type,director_note,department_id,deployed_at,due_date,completed_at,completion_note,progress_feedback";

export async function GET() {
  const auth = await requireApiPermission("incoming_documents.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data, error } = await admin
    .from("incoming_documents")
    .select(SELECT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("received_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, documents: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const receivedAt = String(body.received_at || "").trim();
  const issuingAuthority = String(body.issuing_authority || "").trim();
  const summary = String(body.summary || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) return NextResponse.json({ error: "Ngày đến không hợp lệ." }, { status: 400 });
  if (!issuingAuthority) return NextResponse.json({ error: "Chưa nhập cơ quan ban hành." }, { status: 400 });
  if (!summary) return NextResponse.json({ error: "Chưa nhập trích yếu nội dung." }, { status: 400 });

  const { data, error } = await admin
    .from("incoming_documents")
    .insert({
      organization_id: organizationId,
      received_at: receivedAt,
      received_no: body.received_no ? String(body.received_no).trim() || null : null,
      document_date: body.document_date || null,
      document_no: body.document_no ? String(body.document_no).trim() || null : null,
      issuing_authority: issuingAuthority,
      summary,
      document_type: body.document_type ? String(body.document_type).trim() || null : null,
      created_by: auth.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "incoming_documents",
    row_id: data.id,
    action_type: "INCOMING_DOCUMENT_CREATE",
    new_value: { received_no: data.received_no, issuing_authority: data.issuing_authority, summary: data.summary },
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, document: data });
}
