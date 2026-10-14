import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncAllNotificationsForUser } from "@/lib/notification-orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkYear } from "@/lib/work-year";

export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const year = await getWorkYear();
  const result = await syncAllNotificationsForUser(createAdminClient(), auth.user.id, year);
  return NextResponse.json({ ok: true, ...result });
}
