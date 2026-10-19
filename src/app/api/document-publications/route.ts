import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOwnerLabel, isDisseminationType, isDocumentPublicationType, STAGE_DUE_DAYS } from "@/lib/document-publication-types";
import { addDaysISO, createTrainingForDocument, REVIEW_CYCLE_DAYS } from "@/lib/document-publication-server";

function addDaysFromNowISO(days: number) {
  return addDaysISO(new Date().toISOString().slice(0, 10), days);
}

const SELECT_COLUMNS =
  "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,file_name,created_at";

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
// Riêng nhập trực tiếp văn bản ĐÃ PHÁT HÀNH (direct_publish) bỏ qua toàn bộ
// vòng kiểm soát nên đòi .manage, cùng mức quyền với thao tác "Phát hành"
// bình thường ở PATCH.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const directPublish = body.direct_publish === true;

  const auth = await requireApiPermission(directPublish ? "document_publication.manage" : "document_publication.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

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

  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    title,
    document_type: documentType,
    drafting_department_id: draftingDepartmentId,
    requested_by_name: body.requested_by_name ? String(body.requested_by_name).trim() || null : null,
    reason: body.reason ? String(body.reason).trim() || null : null,
    created_by: auth.user.id,
  };

  if (directPublish) {
    const documentCode = String(body.document_code || "").trim();
    const effectiveDate = String(body.effective_date || "").trim();
    const disseminationType = body.dissemination_type;
    if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });
    if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: "Chưa chọn hình thức phổ biến." }, { status: 400 });
    insertPayload.stage = "PUBLISHED";
    insertPayload.stage_due_date = null;
    insertPayload.current_owner_label = currentOwnerLabel("PUBLISHED", documentType, department.name);
    insertPayload.document_code = documentCode;
    insertPayload.effective_date = effectiveDate;
    insertPayload.review_date = addDaysISO(effectiveDate, REVIEW_CYCLE_DAYS);
    insertPayload.dissemination_type = disseminationType;
  } else {
    insertPayload.stage = "REQUESTED";
    insertPayload.stage_due_date = addDaysFromNowISO(STAGE_DUE_DAYS.REQUESTED);
    insertPayload.current_owner_label = currentOwnerLabel("REQUESTED", documentType, department.name);
  }

  const { data, error } = await admin.from("document_publications").insert(insertPayload).select(SELECT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (directPublish && body.dissemination_type === "TRAINING_REQUIRED") {
    const { error: trainingError } = await createTrainingForDocument(admin, {
      organizationId,
      documentCode: data.document_code!,
      title: data.title,
      draftingDepartmentName: department.name,
      effectiveDate: data.effective_date!,
      documentPublicationId: data.id,
      createdBy: auth.user.id,
    });
    if (trainingError) return NextResponse.json({ error: trainingError.message }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "document_publications",
    row_id: data.id,
    action_type: directPublish ? "DOCUMENT_PUBLICATION_DIRECT_PUBLISH" : "DOCUMENT_PUBLICATION_CREATE",
    new_value: { title: data.title, document_type: data.document_type, drafting_department_id: data.drafting_department_id, stage: data.stage },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, document: data });
}
