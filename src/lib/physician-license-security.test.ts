import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Theo dõi hành nghề bác sĩ: deadline compliance tracking (Tổ Hành chính) —
// no checklist, no approval chain, its own lean table.
describe("Physician license tracking module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain('requireApiPermission("physician_license.view")');
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain('requireApiPermission("physician_license.manage")');
    expect(read("src/app/api/physician-license/registrations/[id]/route.ts")).toContain('requireApiPermission("physician_license.manage")');
  });

  it("is reachable from the sidebar only behind physician_license.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "THEO DÕI HÀNH NGHỀ", href: "/physician-license", icon: "badge-check", permission: "physician_license.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/physician-license/registrations/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/physician-license/registrations/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("stays off every other module's tables", () => {
    const migration = read("supabase/migrations/20261015_physician_license_registrations_v1.sql");
    expect(migration).toContain("create table if not exists public.physician_license_registrations");
    expect(migration).not.toContain("public.hsba_");
    expect(migration).not.toContain("public.procurement_requests");
  });
});

describe("Physician license deadline rules", () => {
  const route = read("src/app/api/physician-license/registrations/route.ts");

  it("gives GĐTT/Trưởng khoa 14 days and bác sĩ 60 days from the effective date for new hires", () => {
    expect(route).toContain('const days = roleType === "GDTT_TK" ? 14 : 60;');
  });

  it("requires internal-transfer registrations to complete 10 days BEFORE the effective date, regardless of role", () => {
    expect(route).toContain('if (caseType === "INTERNAL_TRANSFER") return new Date(base.getTime() - 10 * DAY_MS)');
  });

  it("rejects marking an already-registered record as registered again", () => {
    const idRoute = read("src/app/api/physician-license/registrations/[id]/route.ts");
    expect(idRoute).toContain('if (current.status === "REGISTERED") return NextResponse.json({ error: "Bản ghi này đã đăng ký xong." }, { status: 400 });');
  });
});

// Real finding from a full-app review: the table only ever showed "Quá hạn"
// AFTER the deadline had already passed (client-computed, deadline < today) —
// nothing warned proactively while there was still time to register, even
// though these windows are short (10/14/60 ngày) and missing one risks BHYT
// xuất toán. Fixed two ways: (1) an immediate client-side "Sắp hết hạn" badge,
// and (2) folding this into the same notifications pipeline/thresholds every
// other due-date reminder already uses, scoped to physician_license.manage.
describe("Physician license proactive due-soon warning (not just after-the-fact overdue)", () => {
  it("the table shows a distinct 'Sắp hết hạn' state before the deadline, not only 'Quá hạn' after it", () => {
    const client = read("src/components/physician-license-client.tsx");
    expect(client).toContain("const dueSoon = r.status === \"PENDING\" && !overdue && daysUntil(r.deadline, now) <= DUE_SOON_WINDOW_DAYS;");
    expect(client).toContain("Sắp hết hạn");
  });

  it("a scoped reminder function exists, gated by physician_license.manage, reusing the same notifications table/upsert pattern", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).toContain("export async function syncPhysicianLicenseRemindersForUser(");
    expect(shared).toContain('userHasPermission(admin, userId, "physician_license.manage")');
    expect(shared).toContain('.eq("status", "PENDING")');
    expect(shared).toContain('onConflict: "recipient_user_id,notification_event_key"');
  });

  it("the reminder sync is wired into both existing polling entry points and the background cron", () => {
    const route = read("src/app/api/notifications/sync-physician-license-reminders/route.ts");
    expect(route).toContain("syncPhysicianLicenseRemindersForUser(admin, auth.user.id)");

    const bell = read("src/components/notification-bell.tsx");
    expect(bell).toContain("/api/notifications/sync-physician-license-reminders");

    const myWork = read("src/components/my-work-sync-client.tsx");
    expect(myWork).toContain("/api/notifications/sync-physician-license-reminders");

    const cron = read("src/app/api/cron/sync-notifications/route.ts");
    expect(cron).toContain("syncPhysicianLicenseRemindersForUser(admin, userId)");
  });
});
