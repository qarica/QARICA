export type IncidentLessonAccessInput = {
  recordLifecycleStatus: string;
  incidentWorkflowStatus: string;
  lessonStatus?: string | null;
  canInvestigate: boolean;
  canClose: boolean;
};

export function incidentLessonAccess(input: IncidentLessonAccessInput) {
  const isClosedIncident = input.incidentWorkflowStatus === "CLOSED";
  const isPublished = input.lessonStatus === "PUBLISHED";
  const canWorkBeforeClose =
    input.recordLifecycleStatus === "ACTIVE" &&
    (input.canInvestigate || input.canClose);
  const canWorkAfterClose = isClosedIncident && input.canClose;

  return {
    isClosedIncident,
    isPublished,
    editable: !isPublished && (canWorkAfterClose || (!isClosedIncident && canWorkBeforeClose)),
    canPublish: !isPublished && isClosedIncident && input.canClose,
    postAllowed:
      input.recordLifecycleStatus === "ACTIVE" || isClosedIncident,
  };
}
