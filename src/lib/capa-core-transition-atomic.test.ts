import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CAPA core transition route", () => {
  it("uses the atomic core transition RPC for START, APPROVE and SET_RESOURCES", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('const CORE_TRANSITION_RPC = "qlcl_transition_capa_v1"');
    expect(source).toContain("admin.rpc(CORE_TRANSITION_RPC");
    expect(source).not.toContain('admin.from("capas").update({ workflow_status: newStatus');
    expect(source).not.toContain('admin.from("capas").update({ required_resources: resources');
    expect(source).not.toContain('action_type:`CAPA_${command}`');
  });

  // Real finding from a full-app security review: APPROVE only required the
  // broad capa.manage permission, with no check that the approver differs
  // from the person who created/proposed the CAPA (records.created_by) —
  // the proposer could approve their own CAPA, defeating the propose/approve
  // separation. Block self-approval at the API layer (no RPC/migration
  // needed: records.created_by is already selected for the lifecycle check).
  it("blocks the CAPA's own creator from approving it (propose/approve separation)", () => {
    const source = readFileSync("src/app/api/capa/[id]/workflow/route.ts", "utf8");
    expect(source).toContain('select("id,lifecycle_status,owner_user_id,created_by")');
    expect(source).toContain('command === "APPROVE" && visible.created_by && visible.created_by === auth.user.id');
    expect(source).toContain("Người phê duyệt phải khác người đã tạo/đề xuất CAPA này.");
  });
});
