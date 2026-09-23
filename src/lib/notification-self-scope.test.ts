import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification self-scope guards", () => {
  it("reads notification bell rows through authenticated RLS and self-read RPC", () => {
    const bell = readFileSync("src/components/notification-bell.tsx", "utf8");
    expect(bell).toContain('.from("notifications")');
    expect(bell).toContain("mark_own_notifications_read");
    expect(bell).not.toContain("createAdminClient");
  });

  it("personal reminders remain owner-scoped in RLS", () => {
    const migration = readFileSync("supabase/migrations/20260921_personal_reminders_v1.sql", "utf8");
    expect(migration).toContain("(select auth.uid()) = owner_user_id");
    expect(migration).toContain("personal_reminders_owner_select");
    expect(migration).toContain("personal_reminders_owner_update");
    expect(migration).toContain("personal_reminders_owner_delete");
  });
});
