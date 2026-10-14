import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationInfo, UserContext } from "@/lib/types";

export type RequestContext = {
  user: UserContext;
  organization: OrganizationInfo | null;
};

function queryError(label: string, error: { message: string } | null | undefined): never {
  throw new Error(`[RequestContext:${label}] ${error?.message || "Không tải được dữ liệu."}`);
}

export async function loadRequestContext(
  supabase: SupabaseClient,
  userId: string,
  authEmail: string | null = null,
): Promise<RequestContext> {
  const [profileResult, rolesResult, overridesResult, scopesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id,email,full_name,job_title,primary_department_id,organization_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role_id,roles(code,name)").eq("user_id", userId),
    supabase.from("user_permissions").select("is_allowed,permissions(code)").eq("user_id", userId),
    supabase.from("user_scopes").select("scope_type").eq("user_id", userId),
  ]);

  if (profileResult.error) queryError("profile", profileResult.error);
  if (rolesResult.error) queryError("roles", rolesResult.error);
  if (overridesResult.error) queryError("permission-overrides", overridesResult.error);
  if (scopesResult.error) queryError("scopes", scopesResult.error);

  const profile = profileResult.data as any;
  if (!profile) throw new Error("[RequestContext:profile] Tài khoản chưa có hồ sơ người dùng.");

  const userRoles = (rolesResult.data ?? []) as any[];
  const overrides = (overridesResult.data ?? []) as any[];
  const scopes = (scopesResult.data ?? []) as any[];
  const roleIds = userRoles.map((row) => row.role_id).filter(Boolean);

  const [rolePermissionsResult, organizationResult, departmentResult, departmentRolesResult] = await Promise.all([
    roleIds.length
      ? supabase.from("role_permissions").select("permission_id,permissions(code)").in("role_id", roleIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    profile.organization_id
      ? supabase.from("organizations").select("id,name,short_name,code,logo_path,address,website,timezone,primary_color,secondary_color").eq("id", profile.organization_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    profile.primary_department_id
      ? supabase.from("departments").select("name").eq("id", profile.primary_department_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    profile.primary_department_id
      ? supabase.from("department_user_roles").select("role_type").eq("department_id", profile.primary_department_id).eq("user_id", userId).eq("is_active", true)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if ((rolePermissionsResult as any).error) queryError("role-permissions", (rolePermissionsResult as any).error);
  if ((organizationResult as any).error) queryError("organization", (organizationResult as any).error);
  if ((departmentResult as any).error) queryError("department", (departmentResult as any).error);
  if ((departmentRolesResult as any).error) queryError("department-roles", (departmentRolesResult as any).error);

  const effectivePermissions = new Set<string>(
    (((rolePermissionsResult as any).data ?? []) as any[])
      .map((row) => row.permissions?.code)
      .filter(Boolean),
  );
  for (const row of overrides) {
    const code = row.permissions?.code as string | undefined;
    if (!code) continue;
    if (row.is_allowed) effectivePermissions.add(code);
    else effectivePermissions.delete(code);
  }

  return {
    user: {
      id: userId,
      email: profile.email ?? authEmail,
      fullName: profile.full_name ?? null,
      jobTitle: profile.job_title ?? null,
      primaryDepartmentId: profile.primary_department_id ?? null,
      primaryDepartmentName: (departmentResult as any).data?.name ?? null,
      roleCodes: userRoles.map((row) => row.roles?.code).filter(Boolean),
      roleNames: userRoles.map((row) => row.roles?.name).filter(Boolean),
      permissions: Array.from(effectivePermissions).sort(),
      scopeTypes: scopes.map((row) => row.scope_type).filter(Boolean),
      departmentRoleTypes: (((departmentRolesResult as any).data ?? []) as any[]).map((row) => row.role_type).filter(Boolean),
      organizationId: profile.organization_id ?? null,
    },
    organization: ((organizationResult as any).data as OrganizationInfo | null) ?? null,
  };
}
