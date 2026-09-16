import { describe, expect, it } from "vitest";
import { improvementProjectRollbackPatch, improvementRecordRollbackPatch } from "./improvement-workflow-audit";

describe("improvement workflow audit rollback", () => {
  it("restores project workflow fields exactly from the pre-change snapshot", () => {
    expect(improvementProjectRollbackPatch({
      workflow_status: "PENDING_APPROVAL",
      approved_at: null,
      actual_end_date: null,
      updated_at: "2026-09-16T01:02:03Z",
    })).toEqual({
      workflow_status: "PENDING_APPROVAL",
      approved_at: null,
      actual_end_date: null,
      updated_at: "2026-09-16T01:02:03Z",
    });
  });

  it("restores registry lifecycle and close timestamp from the pre-change snapshot", () => {
    expect(improvementRecordRollbackPatch({
      lifecycle_status: "ACTIVE",
      closed_at: null,
      updated_at: "2026-09-16T03:04:05Z",
    })).toEqual({
      lifecycle_status: "ACTIVE",
      closed_at: null,
      updated_at: "2026-09-16T03:04:05Z",
    });
  });
});
