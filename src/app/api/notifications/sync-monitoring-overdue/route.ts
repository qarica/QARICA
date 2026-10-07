import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMonitoringOverdueForUser } from "@/lib/notification-sync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const admin = createAdminClient();
  const result = await syncMonitoringOverdueForUser(admin, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, ...result });
}
