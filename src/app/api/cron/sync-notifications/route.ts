import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkYear } from "@/lib/work-year";
import { syncActionRemindersForUser, syncEmrRemindersForUser, syncMonitoringOverdueForUser, syncQualityAttentionForUser, syncPersonalRemindersForUser } from "@/lib/notification-sync";

// Every /api/notifications/sync-* route only ever fires for the user whose
// browser is currently polling it (notification-bell.tsx's setInterval) — a
// user who never opens the app never gets an overdue reminder. This endpoint
// closes that gap by running the SAME shared per-user functions for every
// active user, triggered by Vercel Cron instead of a browser tab. It calls
// into src/lib/notification-sync.ts rather than re-deriving any of this
// business logic, so the per-user polling routes and this cron can never
// drift apart (CLAUDE.md: một nghiệp vụ chỉ có một nguồn sự thật).
//
// Requires a CRON_SECRET env var (set in Vercel project settings — not
// something a code change can provide) and a matching entry in vercel.json's
// "crons" array. Vercel sends "Authorization: Bearer $CRON_SECRET" on its own
// scheduled invocations; without that header matching, every request is
// rejected so this endpoint can never be used to mass-trigger notifications
// by an outside caller who merely knows the URL.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const year = await getWorkYear();

  const { data: profiles, error } = await admin.from("profiles").select("user_id").eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let usersProcessed = 0;
  let notificationsCreated = 0;
  const errors: string[] = [];

  for (const profile of profiles ?? []) {
    const userId = (profile as { user_id: string }).user_id;
    const results = await Promise.all([
      syncActionRemindersForUser(admin, userId, year),
      syncEmrRemindersForUser(admin, userId),
      syncMonitoringOverdueForUser(admin, userId),
      syncQualityAttentionForUser(admin, userId, year),
      syncPersonalRemindersForUser(admin, userId),
    ]);
    usersProcessed += 1;
    for (const result of results) {
      if ("error" in result && result.error) errors.push(`${userId}: ${result.error}`);
      else if ("created" in result) notificationsCreated += result.created || 0;
    }
  }

  return NextResponse.json({ ok: true, users_processed: usersProcessed, notifications_created: notificationsCreated, errors: errors.slice(0, 20) });
}
