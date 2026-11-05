import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT =
  "id,department_id,full_name,date_of_birth,gender,national_id,phone,email,license_type,license_number,license_issued_at,license_issued_by,professional_title,display_title,scope_of_practice,proposed_technique,registration_date,decision_no,decision_signed_at,decision_signed_by,decision_status,decision_file_path,decision_file_name,decision_verified_at,decision_verified_by,practice_status_note,license_expiry_date,notes,created_at,updated_at";
const EXISTING_SELECT = "id,organization_id,decision_status,decision_file_path,updated_by";
const LICENSE_TYPES = new Set(["GPHN", "CCHN", "CCHN_DUOC"]);
const DECISION_STATUSES = new Set(["CHUA_SOAN", "DA_SOAN", "DA_KY", "LUU_HO_SO"]);
const clean = (value: unknown) => String(value ?? "").trim();
const dateOrNull = (value: unknown) => {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("practitioner_credentials.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: existing } = await admin.from("practitioner_credentials").select(EXISTING_SELECT).eq("id", id).maybeSingle();
  if (!existing || existing.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy hồ sơ hoặc ngoài phạm vi truy cập." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_by: auth.user.id, updated_at: new Date().toISOString() };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  if (has("department_id")) {
    const departmentId = clean(body.department_id) || null;
    if (departmentId) {
      const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
      if (departmentError) return NextResponse.json({ error: departmentError.message }, { status: 400 });
      if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });
    }
    patch.department_id = departmentId;
  }
  if (has("full_name")) {
    const fullName = clean(body.full_name);
    if (!fullName) return NextResponse.json({ error: "Họ và tên không được để trống." }, { status: 400 });
    patch.full_name = fullName;
  }
  if (has("date_of_birth")) patch.date_of_birth = dateOrNull(body.date_of_birth);
  if (has("gender")) patch.gender = clean(body.gender) || null;
  if (has("national_id")) patch.national_id = clean(body.national_id) || null;
  if (has("phone")) patch.phone = clean(body.phone) || null;
  if (has("email")) patch.email = clean(body.email) || null;
  if (has("license_type")) {
    const licenseType = clean(body.license_type) || null;
    if (licenseType && !LICENSE_TYPES.has(licenseType)) return NextResponse.json({ error: "Loại hồ sơ không hợp lệ (chỉ nhận GPHN, CCHN, CCHN_DUOC)." }, { status: 400 });
    patch.license_type = licenseType;
  }
  if (has("license_number")) patch.license_number = clean(body.license_number) || null;
  if (has("license_issued_at")) patch.license_issued_at = dateOrNull(body.license_issued_at);
  if (has("license_issued_by")) patch.license_issued_by = clean(body.license_issued_by) || null;
  if (has("professional_title")) patch.professional_title = clean(body.professional_title) || null;
  if (has("display_title")) patch.display_title = clean(body.display_title) || null;
  if (has("scope_of_practice")) patch.scope_of_practice = clean(body.scope_of_practice) || null;
  if (has("proposed_technique")) patch.proposed_technique = clean(body.proposed_technique) || null;
  if (has("registration_date")) patch.registration_date = dateOrNull(body.registration_date);
  if (has("decision_no")) patch.decision_no = clean(body.decision_no) || null;
  if (has("decision_signed_at")) patch.decision_signed_at = dateOrNull(body.decision_signed_at);
  if (has("decision_signed_by")) patch.decision_signed_by = clean(body.decision_signed_by) || null;
  if (has("practice_status_note")) patch.practice_status_note = clean(body.practice_status_note) || null;
  if (has("license_expiry_date")) patch.license_expiry_date = dateOrNull(body.license_expiry_date);
  if (has("notes")) patch.notes = clean(body.notes) || null;

  // Gate "Đã ký" (go-live-style, cùng tinh thần emr_rollout_items): KHÔNG cho
  // đặt decision_status='DA_KY' qua patch field thường — chỉ đạt được qua
  // verify_completed:true bên dưới, đòi hỏi có file quyết định thật + người
  // xác minh khác người vừa sửa gần nhất (kiểm soát 4 mắt).
  if (has("decision_status")) {
    const decisionStatus = clean(body.decision_status);
    if (!DECISION_STATUSES.has(decisionStatus)) return NextResponse.json({ error: "Trạng thái quyết định không hợp lệ." }, { status: 400 });
    if (decisionStatus === "DA_KY" && body.verify_completed !== true) {
      return NextResponse.json({ error: "Chỉ chuyển sang 'Đã ký' qua thao tác xác minh (cần đính kèm file quyết định trước)." }, { status: 400 });
    }
    patch.decision_status = decisionStatus;
  }

  let justVerified = false;
  if (body.verify_completed === true) {
    // decision_file_path chỉ được ghi qua route upload riêng
    // ([id]/file/route.ts), không qua PATCH này — luôn đọc giá trị hiện có.
    if (!existing.decision_file_path) return NextResponse.json({ error: "Cần đính kèm file quyết định trước khi xác minh." }, { status: 400 });
    // Kiểm soát "4 mắt": người xác minh phải khác người vừa cập nhật hồ sơ
    // này gần nhất — không được tự xác minh quyết định do chính mình soạn.
    if (existing.updated_by && existing.updated_by === auth.user.id) {
      return NextResponse.json({ error: "Người xác minh phải khác người vừa cập nhật hồ sơ này — không thể tự xác minh quyết định do chính mình soạn." }, { status: 403 });
    }
    patch.decision_status = "DA_KY";
    patch.decision_verified_at = new Date().toISOString();
    patch.decision_verified_by = auth.user.id;
    justVerified = true;
  } else if (has("decision_status") && patch.decision_status !== "DA_KY") {
    // Rời khỏi "Đã ký" (hoặc không đụng tới nó) làm mất hiệu lực xác minh cũ.
    patch.decision_verified_at = null;
    patch.decision_verified_by = null;
  }

  const { data, error } = await admin.from("practitioner_credentials").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "practitioner_credentials",
    row_id: id,
    action_type: "PRACTITIONER_CREDENTIAL_UPDATE",
    new_value: patch,
    reason: "Cập nhật hồ sơ năng lực hành nghề.",
    request_meta: { source: "qlcl-ui" },
  });

  if (justVerified) {
    await admin.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      table_name: "practitioner_credentials",
      row_id: id,
      action_type: "PRACTITIONER_CREDENTIAL_VERIFY",
      new_value: { decision_file_path: existing.decision_file_path, decision_verified_at: patch.decision_verified_at },
      reason: "Xác minh quyết định phân công đã ký.",
      request_meta: { source: "qlcl-ui" },
    });
  }

  return NextResponse.json({ ok: true, credential: data });
}
