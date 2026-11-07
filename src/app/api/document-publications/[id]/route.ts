import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOwnerLabel, DocumentPublicationType, isDisseminationType, isDocumentPublicationType, nextStage, STAGE_DUE_DAYS } from "@/lib/document-publication-types";
import type { DocumentPublicationRequestType } from "@/lib/document-publication-types";
import { addDaysISO, createTrainingForDocument, recordDocumentVersion, REVIEW_CYCLE_DAYS } from "@/lib/document-publication-server";

const SELECT_COLUMNS =
  "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,file_name,created_at,request_type,target_document_id,retracted_at";

// Sửa thông tin 1 văn bản đã tạo — chữa lỗi gõ nhầm tên/đơn vị soạn thảo/
// người đề nghị/lý do ở mọi bước ("xoá rồi tạo lại" không áp dụng được cho
// văn bản đã qua REQUESTED, DELETE chỉ cho phép ở REQUESTED). KHÔNG còn sửa
// được mã văn bản/ngày hiệu lực/lần phát hành ở đây nữa — "cập nhật hay thu
// hồi hay viết mới đều phải qua đề nghị (Tạo yêu cầu)" nên những thay đổi đó
// giờ bắt buộc qua 1 yêu cầu loại UPDATE/RETRACT, có kiểm soát/phê duyệt,
// thay vì sửa tại chỗ không qua duyệt — xem nhánh request_type==="UPDATE"/
// "RETRACT" trong PATCH ADVANCE bên dưới.
async function handleEdit(admin: ReturnType<typeof createAdminClient>, userId: string, organizationId: string, id: string, body: Record<string, unknown>) {
  const { data: current, error: currentError } = await admin
    .from("document_publications")
    .select("id,stage,title,document_type,drafting_department_id,requested_by_name,reason")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

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

  const update: Record<string, unknown> = {
    title,
    document_type: documentType,
    drafting_department_id: draftingDepartmentId,
    requested_by_name: body.requested_by_name ? String(body.requested_by_name).trim() || null : null,
    reason: body.reason ? String(body.reason).trim() || null : null,
    current_owner_label: currentOwnerLabel(current.stage, documentType, department.name),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("document_publications").update(update).eq("id", id).eq("organization_id", organizationId).select(SELECT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: userId,
    table_name: "document_publications",
    row_id: id,
    action_type: "DOCUMENT_PUBLICATION_EDIT",
    old_value: { title: current.title, document_type: current.document_type, drafting_department_id: current.drafting_department_id, requested_by_name: current.requested_by_name, reason: current.reason },
    new_value: update,
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, document: data });
}

// Mọi bước sau "Đề nghị" (kiểm soát nội dung, góp ý, rà soát, phê duyệt,
// phát hành) đều cần document_publication.manage — Đợt 1 chưa tách quyền
// theo từng vai cụ thể (ĐVKS/BGĐ) như bản tham khảo, vì QARICA chưa có phân
// vai Ban Giám đốc ở mức đó.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (body.action === "EDIT") return handleEdit(admin, auth.user.id, organizationId, id, body);
  if (body.action !== "ADVANCE") return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("document_publications")
    .select("id,stage,title,document_type,drafting_department_id,request_type,target_document_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const requestType = (current.request_type || "NEW") as DocumentPublicationRequestType;
  const upcoming = nextStage(current.stage, requestType);
  if (!upcoming) return NextResponse.json({ error: "Văn bản đã phát hành, không còn bước tiếp theo." }, { status: 400 });

  const documentType = current.document_type as DocumentPublicationType;
  let draftingDepartmentName: string | null = null;
  if (current.drafting_department_id) {
    const { data: department } = await admin.from("departments").select("name").eq("id", current.drafting_department_id).maybeSingle();
    draftingDepartmentName = department?.name ?? null;
  }

  const update: Record<string, unknown> = {
    stage: upcoming,
    current_owner_label: currentOwnerLabel(upcoming, documentType, draftingDepartmentName),
    updated_at: new Date().toISOString(),
  };

  // "Nếu a muốn cập nhật hay thu hồi hay viết mới đều phải qua đề nghị văn
  // bản mới" — khi 1 yêu cầu chạm PUBLISHED, hiệu ứng áp dụng khác nhau theo
  // request_type: NEW tự nó trở thành văn bản (như cũ); UPDATE áp version
  // mới lên target_document_id (văn bản ĐÃ PUBLISHED), ghi lịch sử phiên bản
  // cho TARGET chứ không phải cho chính yêu cầu; RETRACT chuyển
  // target_document_id sang stage RETRACTED — không cần mã/ngày/phổ biến/
  // phiên bản vì không phải phát hành nội dung gì mới.
  if (upcoming === "PUBLISHED" && requestType === "RETRACT") {
    if (!current.target_document_id) return NextResponse.json({ error: "Yêu cầu thu hồi thiếu văn bản đích." }, { status: 400 });
    update.stage_due_date = null;
    const { error: retractError } = await admin
      .from("document_publications")
      .update({ stage: "RETRACTED", retracted_at: new Date().toISOString(), current_owner_label: null, review_date: null, updated_at: new Date().toISOString() })
      .eq("id", current.target_document_id)
      .eq("organization_id", organizationId);
    if (retractError) return NextResponse.json({ error: retractError.message }, { status: 400 });
  } else if (upcoming === "PUBLISHED") {
    const documentCode = String(body.document_code || "").trim();
    const effectiveDate = String(body.effective_date || "").trim();
    const disseminationType = body.dissemination_type;
    const versionLabel = String(body.version_label || "").trim();
    if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });
    if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: "Chưa chọn hình thức phổ biến." }, { status: 400 });
    if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });
    update.stage_due_date = null;

    const targetId = requestType === "UPDATE" ? current.target_document_id : id;
    if (requestType === "UPDATE" && !targetId) return NextResponse.json({ error: "Yêu cầu cập nhật thiếu văn bản đích." }, { status: 400 });

    const targetUpdate: Record<string, unknown> = {
      document_code: documentCode,
      effective_date: effectiveDate,
      review_date: addDaysISO(effectiveDate, REVIEW_CYCLE_DAYS),
      dissemination_type: disseminationType,
      version_label: versionLabel,
    };
    if (requestType === "UPDATE") {
      // Yêu cầu UPDATE có thể kèm sửa tên/loại/đơn vị soạn thảo — áp luôn
      // cho văn bản gốc, vì từ lúc này target mới là văn bản hiển thị thật.
      targetUpdate.title = current.title;
      targetUpdate.document_type = documentType;
      targetUpdate.drafting_department_id = current.drafting_department_id;
      targetUpdate.updated_at = new Date().toISOString();
      const { error: targetError } = await admin.from("document_publications").update(targetUpdate).eq("id", targetId).eq("organization_id", organizationId);
      if (targetError) return NextResponse.json({ error: targetError.message }, { status: 400 });
    } else {
      Object.assign(update, targetUpdate);
    }

    if (disseminationType === "TRAINING_REQUIRED") {
      const { error: trainingError } = await createTrainingForDocument(admin, {
        organizationId,
        documentCode,
        title: current.title,
        draftingDepartmentName,
        effectiveDate,
        documentPublicationId: targetId!,
        createdBy: auth.user.id,
      });
      if (trainingError) return NextResponse.json({ error: trainingError.message }, { status: 400 });
    }

    const { error: versionError } = await recordDocumentVersion(admin, {
      organizationId,
      documentPublicationId: targetId!,
      versionLabel,
      documentCode,
      effectiveDate,
      fileName: null,
      createdBy: auth.user.id,
    });
    if (versionError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được lịch sử phiên bản: ${versionError.message}` }, { status: 500 });
  } else {
    update.stage_due_date = addDaysISO(new Date().toISOString().slice(0, 10), STAGE_DUE_DAYS[upcoming]);
  }

  const { data, error } = await admin.from("document_publications").update(update).eq("id", id).eq("organization_id", organizationId).select(SELECT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "document_publications",
    row_id: id,
    action_type: `DOCUMENT_PUBLICATION_ADVANCE_${upcoming}`,
    old_value: { stage: current.stage },
    new_value: { stage: upcoming, request_type: requestType, target_document_id: current.target_document_id },
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, document: data });
}

// Xoá văn bản khai báo nhầm — chỉ cho phép ở bước "Đề nghị" (REQUESTED), vì
// đây là bước duy nhất chưa ai đầu tư công sức kiểm soát/góp ý/phê duyệt; từ
// DRAFTING trở đi phải tiếp tục đi hết quy trình, không xoá ngang được.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("document_publication.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("document_publications")
    .select("id,title,stage")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });
  if (current.stage !== "REQUESTED") return NextResponse.json({ error: "Chỉ xoá được văn bản còn ở bước Đề nghị." }, { status: 400 });

  const { error } = await admin.from("document_publications").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "document_publications",
    row_id: id,
    action_type: "DOCUMENT_PUBLICATION_DELETE",
    old_value: current,
    reason: "Xoá văn bản khai báo nhầm (còn ở bước Đề nghị).",
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã xoá nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
