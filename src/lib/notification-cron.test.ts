import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Real finding from the audit report: all 4 existing /api/notifications/sync-*
// routes derive userId from the CALLER's own session and only ever run when
// that user's browser is polling (notification-bell.tsx's setInterval) — a
// user who never opens the app (on leave, forgets, etc.) never gets an
// overdue reminder, and personal_reminders.remind_at was written on create
// but never read back anywhere (a second dead feature). Fixed by extracting
// each route's per-user logic into src/lib/notification-sync.ts, functions
// parameterized by an explicit userId, so (a) each existing route becomes a
// thin wrapper around the same function it always ran, and (b) a new
// Vercel-Cron-triggered endpoint can loop over every active user and call the
// identical functions — closing the "nobody has the app open" gap without
// duplicating any business rule (CLAUDE.md: một nghiệp vụ chỉ có một nguồn
// sự thật).
describe("Notification reminders run on a schedule, not only when a user's browser polls", () => {
  it("the 4 existing sync-* routes are thin wrappers around the shared, userId-parameterized functions", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).toContain("export async function syncActionRemindersForUser(");
    expect(shared).toContain("export async function syncEmrRemindersForUser(");
    expect(shared).toContain("export async function syncMonitoringOverdueForUser(");
    expect(shared).toContain("export async function syncQualityAttentionForUser(");
    expect(shared).toContain("export async function syncPersonalRemindersForUser(");

    const actionRoute = read("src/app/api/notifications/sync-action-reminders/route.ts");
    expect(actionRoute).toContain("syncActionRemindersForUser(admin, auth.user.id, year)");

    const emrRoute = read("src/app/api/notifications/sync-emr-reminders/route.ts");
    expect(emrRoute).toContain("syncEmrRemindersForUser(admin, auth.user.id)");

    const monitoringRoute = read("src/app/api/notifications/sync-monitoring-overdue/route.ts");
    expect(monitoringRoute).toContain("syncMonitoringOverdueForUser(admin, user.id)");

    const qualityRoute = read("src/app/api/notifications/sync-quality-attention/route.ts");
    expect(qualityRoute).toContain("syncQualityAttentionForUser(admin, auth.user.id, year)");
  });

  it("the quality-attention sync no longer relies on an auth.uid()-implicit RPC once moved to the admin client", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).not.toContain('rpc("has_permission"');
    expect(shared).toContain("userHasPermission(admin, userId,");
  });

  it("personal reminders are read back and turned into a real notification once remind_at has passed", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).toContain('from("personal_reminders")');
    expect(shared).toContain('.eq("status", "OPEN")');
    expect(shared).toContain('.lte("remind_at", nowIso)');
    expect(shared).toContain("PERSONAL_REMINDER_DUE");
  });

  it("a cron endpoint exists, fails closed without CRON_SECRET, and loops over every active user with the same shared functions", () => {
    const cron = read("src/app/api/cron/sync-notifications/route.ts");
    expect(cron).toContain("process.env.CRON_SECRET");
    expect(cron).toContain('if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });');
    expect(cron).toContain('request.headers.get("authorization") !== `Bearer ${secret}`');
    expect(cron).toContain('.eq("is_active", true)');
    expect(cron).toContain("syncActionRemindersForUser(admin, userId, year)");
    expect(cron).toContain("syncEmrRemindersForUser(admin, userId)");
    expect(cron).toContain("syncMonitoringOverdueForUser(admin, userId)");
    expect(cron).toContain("syncQualityAttentionForUser(admin, userId, year)");
    expect(cron).toContain("syncPersonalRemindersForUser(admin, userId)");
  });

  it("vercel.json schedules the cron endpoint", () => {
    const vercelConfig = JSON.parse(read("vercel.json"));
    expect(Array.isArray(vercelConfig.crons)).toBe(true);
    expect(vercelConfig.crons.some((c: any) => c.path === "/api/cron/sync-notifications")).toBe(true);
  });
});
