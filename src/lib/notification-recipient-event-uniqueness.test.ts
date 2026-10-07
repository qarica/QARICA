import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification recipient-event uniqueness", () => {
  it("uses per-recipient event de-duplication in all sync writers", () => {
    const files = ["src/lib/workflow-notifications.ts", "src/lib/notification-sync.ts"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('recipient_user_id,notification_event_key');
      expect(source).not.toContain('onConflict: "notification_event_key"');
    }
  });
});
