import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDeadline } from "@/lib/physician-license";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("physician_license.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));

  const { data: current, error: currentError } = await admin
    .from("physician_license_registrations")
    .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy bản ghi." }, { status: 404 });

  if (body.action === "REGISTER") {
    if (current.status === "REGISTERED") return NextResponse.json({ error: "Bản ghi này đã đăng ký xong." }, { status: 400 });
    const { data, error } = await admin
      .from("physician_license_registrations")
      .update({ status: "REGISTERED", registered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, registration: data });
  }

  // Sửa thông tin khai báo nhầm (không phải chuyển trạng thái) — chỉ cho phép
  // khi còn PENDING; đã REGISTERED thì khoá để không sửa ngược lịch sử tuân
  // thủ đã ghi nhận (giống nguyên tắc khoá sau khi hoàn tất ở các module khác).
  if (body.action === "UPDATE") {
    if (current.status !== "PENDING") return NextResponse.json({ error: "Chỉ sửa được bản ghi chưa đăng ký (PENDING)." }, { status: 400 });

    const departmentId = String(body.department_id || current.department_id).trim();
    const physicianName = String(body.physician_name ?? current.physician_name).trim();
    const roleType = ["GDTT_TK", "BS"].includes(body.role_type) ? body.role_type : current.role_type;
    const caseType = body.case_type === "INTERNAL_TRANSFER" || body.case_type === "NEW_HIRE" ? body.case_type : current.case_type;
    const effectiveDate = String(body.effective_date || current.effective_date).trim();

    if (!departmentId) return NextResponse.json({ error: "Chưa chọn khoa/phòng." }, { status: 400 });
    if (!physicianName) return NextResponse.json({ error: "Chưa nhập tên bác sĩ." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });

    const { data: dept } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    if (!dept) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 400 });

    const deadline = computeDeadline(effectiveDate, roleType, caseType);

    const { data, error } = await admin
      .from("physician_license_registrations")
      .update({
        department_id: departmentId,
        physician_name: physicianName,
        physician_code: body.physician_code !== undefined ? (String(body.physician_code).trim() || null) : undefined,
        role_type: roleType,
        case_type: caseType,
        effective_date: effectiveDate,
        deadline,
        notes: body.notes !== undefined ? (String(body.notes).trim() || null) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "PENDING")
      .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, registration: data });
  }

  return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
}

// Xoá bản ghi khai báo nhầm — chỉ khi còn PENDING, cùng lý do khoá như UPDATE
// ở trên: đã REGISTERED là dữ liệu tuân thủ đã ghi nhận, không xoá được nữa.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("physician_license.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("physician_license_registrations")
    .select("id,status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy bản ghi." }, { status: 404 });
  if (current.status !== "PENDING") return NextResponse.json({ error: "Chỉ xoá được bản ghi chưa đăng ký (PENDING)." }, { status: 400 });

  const { error } = await admin.from("physician_license_registrations").delete().eq("id", id).eq("organization_id", organizationId).eq("status", "PENDING");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
