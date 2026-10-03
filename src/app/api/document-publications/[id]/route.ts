import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOwnerLabel, DocumentPublicationType, isDisseminationType, nextStage, STAGE_DUE_DAYS } from "@/lib/document-publication-types";

const DAY_MS = 86400000;
function addDaysISO(base: string, days: number) {
  return new Date(new Date(`${base}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

const SELECT_COLUMNS =
  "id,title,document_type,drafting_department_id,requested_by_name,reason,version_label,stage,stage_due_date,current_owner_label,document_code,effective_date,review_date,dissemination_type,created_at";

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
  if (body.action !== "ADVANCE") return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("document_publications")
    .select("id,stage,title,document_type,drafting_department_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });

  const upcoming = nextStage(current.stage);
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

  if (upcoming === "PUBLISHED") {
    const documentCode = String(body.document_code || "").trim();
    const effectiveDate = String(body.effective_date || "").trim();
    const disseminationType = body.dissemination_type;
    if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });
    if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: "Chưa chọn hình thức phổ biến." }, { status: 400 });
    update.document_code = documentCode;
    update.effective_date = effectiveDate;
    update.review_date = addDaysISO(effectiveDate, 730);
    update.stage_due_date = null;
    update.dissemination_type = disseminationType;

    // "Cần đào tạo" tự tạo 1 dòng Đào tạo quy trình ngay khi phát hành, liên
    // kết lại văn bản gốc — tái dùng workflow Đào tạo quy trình sẵn có thay
    // vì xây lại cơ chế theo dõi đào tạo riêng cho văn bản.
    if (disseminationType === "TRAINING_REQUIRED") {
      const { error: trainingError } = await admin.from("procedure_trainings").insert({
        organization_id: organizationId,
        procedure_code: documentCode,
        procedure_name: current.title,
        drafting_unit: draftingDepartmentName,
        effective_date: effectiveDate,
        document_publication_id: id,
        created_by: auth.user.id,
      });
      if (trainingError) return NextResponse.json({ error: trainingError.message }, { status: 400 });
    }
  } else {
    update.stage_due_date = addDaysISO(new Date().toISOString().slice(0, 10), STAGE_DUE_DAYS[upcoming]);
  }

  const { data, error } = await admin.from("document_publications").update(update).eq("id", id).eq("organization_id", organizationId).select(SELECT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, document: data });
}
