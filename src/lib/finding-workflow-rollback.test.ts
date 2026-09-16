import { describe, expect, it } from "vitest";
import { findingRecordRollbackPatch, findingRollbackPatch } from "./finding-workflow-rollback";

describe("finding workflow rollback snapshots", () => {
  it("restores finding status, due date and confirmation fields", () => {
    expect(findingRollbackPatch({
      workflow_status: "VERIFYING",
      due_date: "2026-09-30",
      confirmed_by: null,
      confirmed_at: null,
      updated_at: "2026-09-16T01:02:03Z",
    })).toEqual({
      workflow_status: "VERIFYING",
      due_date: "2026-09-30",
      confirmed_by: null,
      confirmed_at: null,
      updated_at: "2026-09-16T01:02:03Z",
    });
  });

  it("restores registry lifecycle and close fields", () => {
    expect(findingRecordRollbackPatch({
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
