import { createAdminClient } from "@/lib/supabase/admin";

export async function writePermissionOverrides(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  assignedBy: string,
  roleIds: string[],
  effective: Set<string>,
) {
  const [{ data: rolePerms }, { data: allPerms }] = await Promise.all([
    admin.from("role_permissions").select("permission_id").in("role_id", roleIds),
    admin.from("permissions").select("id").eq("is_active", true),
  ]);
  const baseline = new Set((rolePerms ?? []).map((r: any) => r.permission_id));
  const rows = (allPerms ?? []).flatMap((p: any) => {
    const wanted = effective.has(p.id);
    const normal = baseline.has(p.id);
    return wanted === normal ? [] : [{ user_id: userId, permission_id: p.id, is_allowed: wanted, assigned_by: assignedBy }];
  });
  const { error: deleteError } = await admin.from("user_permissions").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  if (rows.length) {
    const { error } = await admin.from("user_permissions").insert(rows);
    if (error) throw error;
  }
}
