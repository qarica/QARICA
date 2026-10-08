import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Real gap: role_permissions (what a Role grants by default) had NO UI path
// at all — only per-user overrides (user_permissions) were editable via
// /admin/users. Changing a Role's own default set required editing the
// database directly. This route is the missing piece: toggle one
// role<->permission pair, audited like every other admin mutation.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("permissions.manage");
  if (!auth.ok) return auth.response;
  const { id: roleId } = await params;
  const body = await request.json().catch(() => ({}));
  const permissionId = String(body.permission_id || "").trim();
  const granted = body.granted === true;
  if (!permissionId) return NextResponse.json({ error: "Thiếu quyền cần gán/bỏ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: role, error: roleError } = await admin.from("roles").select("id,code,name,is_active").eq("id", roleId).maybeSingle();
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 400 });
  if (!role || !role.is_active) return NextResponse.json({ error: "Không tìm thấy vai trò hoặc vai trò đã ngưng hoạt động." }, { status: 404 });

  const { data: permission, error: permissionError } = await admin.from("permissions").select("id,code,name").eq("id", permissionId).eq("is_active", true).maybeSingle();
  if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 400 });
  if (!permission) return NextResponse.json({ error: "Không tìm thấy quyền hoặc quyền đã ngưng hoạt động." }, { status: 404 });

  if (granted) {
    // role_permissions predates this repo's tracked migrations, so its exact
    // unique-constraint name isn't known here — check-then-insert instead of
    // upsert(onConflict:...), matching the "not exists" pattern every
    // existing role_permissions migration in this codebase already uses.
    const { data: existing, error: existingError } = await admin.from("role_permissions").select("role_id").eq("role_id", roleId).eq("permission_id", permissionId).maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
    if (!existing) {
      const { error } = await admin.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await admin.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    table_name: "role_permissions",
    row_id: roleId,
    action_type: granted ? "ROLE_PERMISSION_GRANT" : "ROLE_PERMISSION_REVOKE",
    old_value: { role_code: role.code, permission_code: permission.code, granted: !granted },
    new_value: { role_code: role.code, permission_code: permission.code, granted },
    reason: `${granted ? "Gán" : "Bỏ"} quyền ${permission.code} cho vai trò ${role.name}.`,
    request_meta: { source: "qlcl-ui" },
  });
  if (auditError) return NextResponse.json({ error: `Đã cập nhật nhưng không ghi được audit trail: ${auditError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
