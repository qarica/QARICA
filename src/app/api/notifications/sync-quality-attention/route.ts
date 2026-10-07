import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";
import { syncQualityAttentionForUser } from "@/lib/notification-sync";

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const year = await getWorkYear();
  const admin = createAdminClient();
  const result = await syncQualityAttentionForUser(admin, auth.user.id, year);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, ...result });
}
