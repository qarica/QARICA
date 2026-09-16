export type ImprovementProjectWorkflowSnapshot = {
  workflow_status?: string | null;
  approved_at?: string | null;
  actual_end_date?: string | null;
  updated_at?: string | null;
};

export type ImprovementRecordWorkflowSnapshot = {
  lifecycle_status?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

export function improvementProjectRollbackPatch(snapshot: ImprovementProjectWorkflowSnapshot) {
  return {
    workflow_status: String(snapshot.workflow_status || "DRAFT"),
    approved_at: snapshot.approved_at ?? null,
    actual_end_date: snapshot.actual_end_date ?? null,
    updated_at: snapshot.updated_at ?? null,
  };
}

export function improvementRecordRollbackPatch(snapshot: ImprovementRecordWorkflowSnapshot) {
  return {
    lifecycle_status: String(snapshot.lifecycle_status || "ACTIVE"),
    closed_at: snapshot.closed_at ?? null,
    updated_at: snapshot.updated_at ?? null,
  };
}
