import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Safety Alert workflow route", () => {
  it("uses one atomic workflow RPC without route-side status/history/audit writes", () => {
    const source = readFileSync("src/app/api/safety-alerts/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const TRANSITION_RPC = "qlcl_transition_safety_alert_v1"');
    expect(source).toContain("admin.rpc(TRANSITION_RPC");
    expect(source).not.toContain('from("safety_alerts").update');
    expect(source).not.toContain('from("records").update');
    expect(source).not.toContain('from("record_status_history").insert');
    expect(source).not.toContain('from("audit_logs").insert');
    expect(source).not.toContain("updated_at: now");
  });
});
