import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification sync throttling", () => {
  it("does not run monitoring synchronization on every 5-second bell poll", () => {
    const source = readFileSync("src/components/notification-bell.tsx", "utf8");
    expect(source).toContain("const MONITORING_SYNC_INTERVAL_MS = 15_000");
    expect(source).toContain("lastMonitoringSyncRef");
    expect(source).toContain("now - lastMonitoringSyncRef.current >= MONITORING_SYNC_INTERVAL_MS");
    expect(source).toContain("const QUALITY_SYNC_INTERVAL_MS = 60_000");
  });
});
