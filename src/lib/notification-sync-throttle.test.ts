import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification sync throttling", () => {
  it("syncs all modules once per 60 seconds while reading the bell list every 15 seconds", () => {
    const source = readFileSync("src/components/notification-bell.tsx", "utf8");
    expect(source).toContain("const SYNC_INTERVAL_MS = 60_000");
    expect(source).toContain("const LIST_INTERVAL_MS = 15_000");
    expect(source).toContain("now - lastSyncRef.current >= SYNC_INTERVAL_MS");
    expect(source).toContain("syncNotifications()");
    expect(source).not.toContain("sync-monitoring-overdue");
  });
});
