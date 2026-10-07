import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for an approved gap: EMR items had due dates and cert-expiry
// KPIs but nothing ever reminded anyone — the generic QLCL notification
// system (notifications table, upsert-by-event-key, sync routes polled from
// the client) never touched emr_rollout_items. This adds a 4th sync route
// modeled directly on sync-action-reminders/route.ts's phase thresholds and
// payload shape (same notifications table, same upsert/onConflict pattern),
// instead of inventing a second notification mechanism. Certificate expiry
// (Chữ ký số) is folded into the SAME route/table rather than a separate
// certificate-specific reminder mechanism, per the one-source-of-truth rule.
describe("EMR — due-date and certificate-expiry reminders", () => {
  const route = readFileSync("src/lib/notification-sync.ts", "utf8");
  const bell = readFileSync("src/components/notification-bell.tsx", "utf8");
  const myWork = readFileSync("src/components/my-work-sync-client.tsx", "utf8");

  it("writes to the same shared notifications table with the same idempotent upsert-by-event-key pattern as every other sync route", () => {
    expect(route).toContain('.from("notifications")');
    expect(route).toContain('.upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })');
  });

  it("reuses the same urgency phase thresholds as Action reminders (OVERDUE_7/OVERDUE_3/OVERDUE/DUE_TODAY/DUE_SOON) instead of a new scale", () => {
    for (const code of ["OVERDUE_7", "OVERDUE_3", "OVERDUE", "DUE_TODAY", "DUE_SOON"]) {
      expect(route).toContain(`code: "${code}"`);
    }
  });

  it("folds certificate expiry (Chữ ký số) into the same route/notification family rather than a separate mechanism", () => {
    expect(route).toContain("certificate_expiry");
    expect(route).toContain('item.category === "CHU_KY_SO"');
    expect(route).toContain('code: "CERT_EXPIRING"');
    expect(route).toContain('code: "CERT_EXPIRED"');
  });

  // "Người phụ trách" (a single named owner) was later replaced by "Đơn vị
  // phụ trách" (owner_department_id) — reminders now go to the
  // HEAD/QUALITY_NETWORK_MEMBER of that department, the same department-wide
  // escalation audience sync-action-reminders already uses.
  it("notifies the HEAD/QUALITY_NETWORK_MEMBER of the item's owner_department_id, the same department-escalation pattern Actions use", () => {
    expect(route).toContain('.eq("owner_department_id", primaryDepartmentId)');
    expect(route).toContain('.in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"])');
  });

  it("excludes DONE items from due-date reminders (a finished item has nothing left to be overdue on)", () => {
    expect(route).toContain('item.status !== "DONE" && item.due_date');
  });

  it("is polled from both entry points that already drive every other sync route — the bell (60s quality-attention bucket) and the 'Việc của tôi' mount-time sync", () => {
    expect(bell).toContain("/api/notifications/sync-emr-reminders");
    expect(myWork).toContain("/api/notifications/sync-emr-reminders");
  });
});
