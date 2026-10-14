import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync("src/lib/recurring-cleanup.ts", "utf8");
const route = readFileSync("src/app/api/calendar/recurring/[id]/route.ts", "utf8");

describe("recurring template deactivation cleanup", () => {
  it("keeps the actions lookup but has a canonical-record metadata fallback", () => {
    expect(helper).toContain('.from("actions")');
    expect(helper).toContain('.from("records")');
    expect(helper).toContain('.contains("metadata", { recurring_template_id: templateId })');
    expect(helper).toContain("recurring_run_id");
  });

  it("uses record-link fallbacks for monitoring lineage", () => {
    expect(helper).toContain('.eq("relation_type", "HAS_ACTION")');
    expect(helper).toContain('.eq("relation_type", "MATERIALIZES")');
  });

  it("cancels through the lifecycle RPC rather than deleting records", () => {
    expect(helper).toContain('rpc("qlcl_change_record_lifecycle_v1"');
    expect(helper).not.toContain('.from("records").delete()');
  });

  it("the recurring route calls the shared helper with organization scope", () => {
    expect(route).toContain("cancelFutureGeneratedOutputs(admin, id, organizationId, auth.user.id)");
  });
});
