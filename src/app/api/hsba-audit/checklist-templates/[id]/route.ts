import { NextResponse } from "next/server";
import { callerOrganizationId, requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("hsba_audit.manage");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { organizationId, error: callerError } = await callerOrganizationId(admin, auth.user.id);
  if (callerError) return NextResponse.json({ error: callerError.message }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "Tài khoản chưa gắn tổ chức." }, { status: 400 });

  const { data: template } = await admin.from("hsba_checklist_templates").select("id,organization_id").eq("id", id).maybeSingle();
  if (!template || template.organization_id !== organizationId) return NextResponse.json({ error: "Không tìm thấy mẫu bảng kiểm." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Tên mẫu bảng kiểm không được để trống." }, { status: 400 });
    patch.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    patch.description = String(body.description || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    patch.is_active = body.is_active === true;
  }

  const { error } = await admin.from("hsba_checklist_templates").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
