import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationInfo, UserContext } from "@/lib/types";

export const requireUserContext = cache(async (): Promise<{
  user: UserContext;
  organization: OrganizationInfo | null;
}> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const authEmail =
    typeof (claims as { email?: unknown } | undefined)?.email === "string"
      ? ((claims as { email?: string }).email ?? null)
      : null;

  if (!userId) redirect("/login");

  const [profileResult, rolesResult, overridesResult, scopesResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "user_id,email,full_name,job_title,primary_department_id,organization_id,departments(name)",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role_id,roles(code,name)")
        .eq("user_id", userId),
      supabase
        .from("user_permissions")
        .select("is_allowed,permissions(code)")
        .eq("user_id", userId),
      supabase
        .from("user_scopes")
        .select("scope_type")
        .eq("user_id", userId),
    ]);

  const profile = profileResult.data as any;
  const userRoles = (rolesResult.data ?? []) as any[];
  const overrides = (overridesResult.data ?? []) as any[];
  const scopes = (scopesResult.data ?? []) as any[];

  const roleIds = userRoles.map((row) => row.role_id).filter(Boolean);
  const roleCodes = userRoles
    .map((row) => row.roles?.code)
    .filter(Boolean) as string[];
  const roleNames = userRoles
    .map((row) => row.roles?.name)
    .filter(Boolean) as string[];

  const [rolePermissionsResult, organizationResult] = await Promise.all([
    roleIds.length
      ? supabase
          .from("role_permissions")
          .select("permission_id,permissions(code)")
          .in("role_id", roleIds)
      : Promise.resolve({ data: [] as any[] }),
    profile?.organization_id
      ? supabase
          .from("organizations")
          .select(
            "id,name,short_name,code,logo_path,address,website,timezone,primary_color,secondary_color",
          )
          .eq("id", profile.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rolePermissions = new Set<string>(
    ((rolePermissionsResult.data ?? []) as any[])
      .map((row) => row.permissions?.code)
      .filter(Boolean),
  );

  for (const row of overrides) {
    const code = row.permissions?.code as string | undefined;
    if (!code) continue;
    if (row.is_allowed) rolePermissions.add(code);
    else rolePermissions.delete(code);
  }

  return {
    user: {
      id: userId,
      email: profile?.email ?? authEmail,
      fullName: profile?.full_name ?? null,
      jobTitle: profile?.job_title ?? null,
      primaryDepartmentId: profile?.primary_department_id ?? null,
      primaryDepartmentName: profile?.departments?.name ?? null,
      roleCodes,
      roleNames,
      permissions: Array.from(rolePermissions).sort(),
      scopeTypes: scopes.map((s) => s.scope_type),
      organizationId: profile?.organization_id ?? null,
    },
    organization: (organizationResult.data as OrganizationInfo | null) ?? null,
  };
});

export function hasPermission(user: UserContext, code: string) {
  return user.permissions.includes(code);
}

export function hasAnyPermission(user: UserContext, codes: string[]) {
  return codes.some((code) => user.permissions.includes(code));
}

export function requirePermission(user: UserContext, code: string) {
  if (!hasPermission(user, code)) redirect("/dashboard?forbidden=1");
}
