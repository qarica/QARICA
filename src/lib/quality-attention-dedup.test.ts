import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quality attention notification de-duplication", () => {
  it("deduplicates within a deadline phase while allowing urgency escalation", () => {
    const source = readFileSync("src/app/api/notifications/sync-quality-attention/route.ts", "utf8");
    expect(source).toContain("quality:directive:${row.id}:${phase.phase}:due:");
    expect(source).toContain("quality:report:${row.id}:${phase.phase}:due:");
    expect(source).toContain("quality:risk:${row.id}:${phase.phase}:review:");
    expect(source).toContain("quality:capa:${row.id}:${phase.phase}:effectiveness:");
    expect(source).toContain("quality:feedback:${row.id}:${phase.phase}:response:");
    expect(source).toContain("quality:inspection:${row.id}:${phase.phase}:visit:");
    expect(source).toContain("quality:finding:${row.id}:${phase.phase}:due:");
    expect(source).toContain('upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })');
  });
});
