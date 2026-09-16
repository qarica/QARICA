export type FindingWorkflowSnapshot = {
  workflow_status?: string | null;
  due_date?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  updated_at?: string | null;
};

export type FindingRecordSnapshot = {
  lifecycle_status?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

export function findingRollbackPatch(snapshot: FindingWorkflowSnapshot) {
  return {
    workflow_status: String(snapshot.workflow_status || "OPEN"),
    due_date: snapshot.due_date ?? null,
    confirmed_by: snapshot.confirmed_by ?? null,
    confirmed_at: snapshot.confirmed_at ?? null,
    updated_at: snapshot.updated_at ?? null,
  };
}

export function findingRecordRollbackPatch(snapshot: FindingRecordSnapshot) {
  return {
    lifecycle_status: String(snapshot.lifecycle_status || "ACTIVE"),
    closed_at: snapshot.closed_at ?? null,
    updated_at: snapshot.updated_at ?? null,
  };
}
