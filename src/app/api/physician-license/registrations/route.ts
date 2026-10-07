import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 86400000;

// Thời hạn đăng ký hành nghề (Tổ Hành chính):
// - Luân chuyển site nội bộ: phải đăng ký xong TRƯỚC ngày hiệu lực tối thiểu 10 ngày.
// - Giám đốc TT/Trưởng khoa (GDTT_TK), nhân sự mới: trong vòng 2 tuần kể từ ngày hiệu lực.
// - Bác sĩ (BS), nhân sự mới: tối đa 2 tháng (60 ngày) kể từ ngày hiệu lực.
function computeDeadline(effectiveDate: string, roleType: string, caseType: string) {
  const base = new Date(`${effectiveDate}T00:00:00Z`);
  if (caseType === "INTERNAL_TRANSFER") return new Date(base.getTime() - 10 * DAY_MS).toISOString().slice(0, 10);
  const days = roleType === "GDTT_TK" ? 14 : 60;
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("physician_license.view");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  // A view-only caller (physician_license.view, granted broadly alongside
  // tasks.view when this module shipped) only sees its own khoa/phòng's
  // registrations — not every physician in the hospital. Only
  // physician_license.manage (Tổ Hành chính) keeps the full organization list.
  const { data: canManageData } = await auth.supabase.rpc("has_permission", { p_permission_code: "physician_license.manage" });
  const canManage = !!canManageData;

  const status = new URL(request.url).searchParams.get("status");
  let query = admin
    .from("physician_license_registrations")
    .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes")
    .eq("organization_id", organizationId)
    .order("deadline", { ascending: true })
    .limit(300);
  if (status) query = query.eq("status", status);
  if (!canManage) {
    const { data: profile } = await admin.from("profiles").select("primary_department_id").eq("user_id", auth.user.id).maybeSingle();
    query = query.eq("department_id", profile?.primary_department_id || "00000000-0000-0000-0000-000000000000");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, registrations: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("physician_license.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const departmentId = String(body.department_id || "").trim();
  const physicianName = String(body.physician_name || "").trim();
  const roleType = ["GDTT_TK", "BS"].includes(body.role_type) ? body.role_type : null;
  const caseType = body.case_type === "INTERNAL_TRANSFER" ? "INTERNAL_TRANSFER" : "NEW_HIRE";
  const effectiveDate = String(body.effective_date || "").trim();

  if (!departmentId) return NextResponse.json({ error: "Chưa chọn khoa/phòng." }, { status: 400 });
  if (!physicianName) return NextResponse.json({ error: "Chưa nhập tên bác sĩ." }, { status: 400 });
  if (!roleType) return NextResponse.json({ error: "Chưa chọn vai trò (GĐTT/TK hoặc BS)." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });

  const deadline = computeDeadline(effectiveDate, roleType, caseType);

  const { data, error } = await admin
    .from("physician_license_registrations")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      physician_name: physicianName,
      physician_code: body.physician_code ? String(body.physician_code).trim() || null : null,
      role_type: roleType,
      case_type: caseType,
      effective_date: effectiveDate,
      deadline,
      status: "PENDING",
      notes: body.notes ? String(body.notes).trim() || null : null,
      created_by: auth.user.id,
    })
    .select("id,department_id,physician_name,physician_code,role_type,case_type,effective_date,deadline,status,registered_at,notes")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, registration: data });
}
