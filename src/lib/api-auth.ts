import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
