import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOwnerLabel, isDocumentPublicationType, STAGE_DUE_DAYS } from "@/lib/document-publication-types";

const DAY_MS = 86400000;
function addDaysISO(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

const SELECT_COLUMNS =
  "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,created_at";

export async function GET(request: Request) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const stage = new URL(request.url).searchParams.get("stage");
  let query = admin.from("document_publications").select(SELECT_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(300);
  if (stage) query = query.eq("stage", stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, documents: data ?? [] });
}

// "Đề nghị" là bước ai cũng gửi được (đơn vị sử dụng) — chỉ cần
// document_publication.view, không cần .manage như các bước kiểm soát sau đó.
export async function POST(request: Request) {
  const auth = await requireApiPermission("document_publication.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const documentType = body.document_type;
  const draftingDepartmentId = String(body.drafting_department_id || "").trim();

  if (!title) return NextResponse.json({ error: "Chưa nhập tên văn bản." }, { status: 400 });
  if (!isDocumentPublicationType(documentType)) return NextResponse.json({ error: "Chưa chọn loại tài liệu." }, { status: 400 });
  if (!draftingDepartmentId) return NextResponse.json({ error: "Chưa chọn đơn vị soạn thảo." }, { status: 400 });

  const { data: department, error: departmentError } = await admin
    .from("departments")
    .select("name")
    .eq("id", draftingDepartmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
  if (!department) return NextResponse.json({ error: "Đơn vị soạn thảo không hợp lệ." }, { status: 400 });

  const { data, error } = await admin
    .from("document_publications")
    .insert({
      organization_id: organizationId,
      title,
      document_type: documentType,
      drafting_department_id: draftingDepartmentId,
      requested_by_name: body.requested_by_name ? String(body.requested_by_name).trim() || null : null,
      reason: body.reason ? String(body.reason).trim() || null : null,
      stage: "REQUESTED",
      stage_due_date: addDaysISO(STAGE_DUE_DAYS.REQUESTED),
      current_owner_label: currentOwnerLabel("REQUESTED", documentType, department.name),
      created_by: auth.user.id,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, document: data });
}
