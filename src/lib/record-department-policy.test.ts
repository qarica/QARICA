import { describe, expect, it } from "vitest";
import { canManageRecordDepartments, isRecordDepartmentRole } from "./record-department-policy";

describe("record department participation policy", () => {
  it("uses the source module permission", () => {
    expect(canManageRecordDepartments(["incident.triage"], "INCIDENT")).toBe(true);
    expect(canManageRecordDepartments(["incident.investigate"], "INCIDENT")).toBe(true);
    expect(canManageRecordDepartments(["incident.report"], "INCIDENT")).toBe(false);
    expect(canManageRecordDepartments(["plans.manage"], "INCIDENT")).toBe(false);
    expect(canManageRecordDepartments(["capa.manage"], "CAPA")).toBe(true);
  });

  it("does not treat the primary role as a secondary participant role", () => {
    expect(isRecordDepartmentRole("RELATED")).toBe(true);
    expect(isRecordDepartmentRole("COORDINATING")).toBe(true);
    expect(isRecordDepartmentRole("LEAD")).toBe(false);
    expect(isRecordDepartmentRole("OWNER")).toBe(false);
  });
});
