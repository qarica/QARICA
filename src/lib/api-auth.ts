import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

export async function requireApiPermission(permission: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  }

  const { data: allowed, error } = await supabase.rpc("has_permission", {
    p_permission_code: permission,
  });
  if (error || !allowed) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 }) };
  }

  return { ok: true as const, user, supabase };
}

// Shared by every EMR admin-client API route that needs the caller's
// organization_id (binding-groups, items, timeline-milestones) — this exact
// lookup used to be copy-pasted into each route file (four of the five
// copies byte-identical, one silently dropping the query's own error
// instead of surfacing it). One shared helper, one behavior.
export async function callerOrganizationId(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return { organizationId: data?.organization_id ?? null, error };
}

// For modules open to every authenticated user (no granular permission code) - still
// requires login, but skips the has_permission RPC entirely.
export async function requireApiUser() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  }
  return { ok: true as const, user, supabase };
}
