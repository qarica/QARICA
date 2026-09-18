import { describe, expect, it } from "vitest";
import { incidentLessonAccess } from "./incident-lessons-policy";

describe("incident lessons policy", () => {
  it("allows a closer to publish after close even though the record lifecycle is CLOSED", () => {
    const access = incidentLessonAccess({
      recordLifecycleStatus: "CLOSED",
      incidentWorkflowStatus: "CLOSED",
      lessonStatus: "DRAFT",
      canInvestigate: true,
      canClose: true,
    });
    expect(access.postAllowed).toBe(true);
    expect(access.editable).toBe(true);
    expect(access.canPublish).toBe(true);
  });

  it("does not let an investigator without close permission edit a closed incident lesson", () => {
    const access = incidentLessonAccess({
      recordLifecycleStatus: "CLOSED",
      incidentWorkflowStatus: "CLOSED",
      lessonStatus: "DRAFT",
      canInvestigate: true,
      canClose: false,
    });
    expect(access.editable).toBe(false);
    expect(access.canPublish).toBe(false);
  });

  it("locks a published lesson in the UI", () => {
    const access = incidentLessonAccess({
      recordLifecycleStatus: "CLOSED",
      incidentWorkflowStatus: "CLOSED",
      lessonStatus: "PUBLISHED",
      canInvestigate: true,
      canClose: true,
    });
    expect(access.editable).toBe(false);
    expect(access.canPublish).toBe(false);
  });
});
