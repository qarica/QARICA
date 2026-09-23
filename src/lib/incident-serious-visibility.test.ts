import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("serious incident visibility", () => {
  it("passes persisted harm/serious flags into the main workflow", () => {
    const parent=readFileSync("src/components/domain-workflow-panel.tsx","utf8");
    expect(parent).toContain("harm_status,serious_event_flag");
    expect(parent).toContain("seriousEvent={!!incident.serious_event_flag}");
  });

  it("shows a persistent critical banner and prevents unchecking severe/death classification", () => {
    const client=readFileSync("src/components/incident-workflow-client.tsx","utf8");
    expect(client).toContain("Sự cố nghiêm trọng — ưu tiên xử lý");
    expect(client).toContain("disabled={seriousByHarm}");
    expect(client).toContain("displaySerious=seriousEvent||serious||seriousByHarm");
  });
});
