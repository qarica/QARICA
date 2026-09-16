import { describe, expect, it } from "vitest";
import { canVerifyTask, taskStepResponsibility, taskVerificationPermissions } from "./task-verification-policy";

describe("task verification policy", () => {
  it("uses incident workflow permissions for an incident Action", () => {
    expect(canVerifyTask(["incident.triage"], ["INCIDENT"], false)).toBe(true);
    expect(canVerifyTask(["incident.investigate"], ["INCIDENT"], false)).toBe(true);
    expect(canVerifyTask(["plans.manage"], ["INCIDENT"], false)).toBe(false);
    expect(canVerifyTask(["incident.report"], ["INCIDENT"], false)).toBe(false);
  });

  it("keeps plans.manage for plan Actions", () => {
    expect(taskVerificationPermissions([], true)).toEqual(["plans.manage"]);
    expect(canVerifyTask(["plans.manage"], [], true)).toBe(true);
  });

  it("maps other linked Actions to their source module", () => {
    expect(canVerifyTask(["findings.manage"], ["FINDING"], false)).toBe(true);
    expect(canVerifyTask(["capa.manage"], ["CAPA"], false)).toBe(true);
    expect(canVerifyTask(["risk.manage"], ["RISK"], false)).toBe(true);
    expect(canVerifyTask(["audit.manage"], ["AUDIT"], false)).toBe(true);
  });

  it("keeps the legacy manager fallback only for a standalone Action", () => {
    expect(canVerifyTask(["plans.manage"], [], false)).toBe(true);
  });

  it("shows the assignee during execution and the incident team during verification", () => {
    expect(taskStepResponsibility("IN_PROGRESS", "Nguyễn Văn A", ["INCIDENT"], false)).toEqual({
      step: "Thực hiện",
      responsible: "Nguyễn Văn A",
      nextAction: "Hoàn thành công việc, nộp minh chứng và gửi xác minh",
    });
    expect(taskStepResponsibility("EVIDENCE_SUBMITTED", "Nguyễn Văn A", ["INCIDENT"], false).responsible)
      .toBe("QLCL / người có quyền phân loại hoặc điều tra sự cố");
  });
});
