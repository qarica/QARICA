import { describe, expect, it } from "vitest";
import { canEditAuditScope, canEditAuditSession, hasAuditScopeContent, validAuditSessionWindow } from "./audit-setup";

describe("audit setup edit rules", () => {
  it("allows scope changes only while Audit is draft", () => {
    expect(canEditAuditScope("DRAFT")).toBe(true);
    expect(canEditAuditScope("IN_PROGRESS")).toBe(false);
    expect(canEditAuditScope("CLOSED")).toBe(false);
  });

  it("allows session changes only for planned sessions while Audit is in progress", () => {
    expect(canEditAuditSession("IN_PROGRESS", "PLANNED")).toBe(true);
    expect(canEditAuditSession("IN_PROGRESS", "COMPLETED")).toBe(false);
    expect(canEditAuditSession("DRAFT_REPORT", "PLANNED")).toBe(false);
  });

  it("validates session timing", () => {
    expect(validAuditSessionWindow("2026-09-16T08:00", "2026-09-16T09:00")).toBe(true);
    expect(validAuditSessionWindow("2026-09-16T08:00", "2026-09-16T08:00")).toBe(false);
    expect(validAuditSessionWindow("", "2026-09-16T09:00")).toBe(false);
  });

  it("requires at least one meaningful scope field", () => {
    expect(hasAuditScopeContent({ departmentId: "", processName: "", areaName: "", description: "" })).toBe(false);
    expect(hasAuditScopeContent({ processName: "Cấp cứu" })).toBe(true);
  });
});
