import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification delivery retry worker", () => {
  const route = readFileSync("src/app/api/cron/process-notification-deliveries/route.ts", "utf8");
  const vercel = readFileSync("vercel.json", "utf8");

  it("requires cron secret and only processes due retryable deliveries", () => {
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain('["QUEUED", "FAILED"]');
    expect(route).toContain('.lt("attempt_count", 5)');
    expect(route).toContain("next_attempt_at");
  });

  it("runs hourly", () => {
    expect(vercel).toContain("/api/cron/process-notification-deliveries");
    expect(vercel).toContain("0 * * * *");
  });
});
