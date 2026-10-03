import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("physician_license.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (body.action !== "REGISTER") return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });

  const { data: current, error: currentError } = await admin
    .from("physician_license_registrations")
    .select("id,status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!current) return NextResponse.json({ error: "Không tìm thấy bản ghi." }, { status: 404 });
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
