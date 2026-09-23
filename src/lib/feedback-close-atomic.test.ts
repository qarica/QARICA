import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Feedback terminal workflow", () => {
  it("closes Feedback through a single atomic RPC", () => {
    const source = readFileSync("src/app/api/feedback/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CLOSE_RPC = "qlcl_close_feedback_v1"');
    expect(source).toContain("admin.rpc(CLOSE_RPC");
    expect(source).not.toContain('from("record_status_history").insert');
    expect(source).not.toContain('from("records").update({ lifecycle_status: "CLOSED"');
    expect(source).not.toContain('if (command === "CLOSE") update.closed_at = now');
  });
});
