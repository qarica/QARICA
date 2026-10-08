import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Danh sách nhân viên đang hoạt động của 1 khoa/phòng, dùng để gán "nhân viên
// phụ trách" (owner_user_id) cho 1 lỗi HSBA/Phác đồ/QTKT — chỉ người có
// hsba_audit.manage mới được gán, nên route này cũng yêu cầu đúng quyền đó.
export async function GET(request: Request) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const departmentId = new URL(request.url).searchParams.get("department_id");
  if (!departmentId) return NextResponse.json({ error: "Thiếu department_id." }, { status: 400 });
  const { data: department } = await admin.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).maybeSingle();
  if (!department) return NextResponse.json({ error: "Khoa/phòng không hợp lệ." }, { status: 404 });

  const { data, error } = await admin
    .from("profiles")
    .select("user_id,full_name,email")
    .eq("organization_id", organizationId)
    .eq("primary_department_id", departmentId)
    .eq("is_active", true)
    .order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, staff: (data ?? []).map((p) => ({ id: p.user_id, name: p.full_name || p.email || p.user_id })) });
}
