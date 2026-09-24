import { humanStatus } from "@/lib/format";

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  const raw = status || "UNKNOWN";
  const tone =
    raw === "COMPLETED" || raw === "CLOSED" || raw === "EFFECTIVE" || raw === "VERIFIED" || raw === "LOCKED" ? "success" :
    raw === "RETURNED" || raw === "OVERDUE" || raw === "REOPENED" || raw === "INEFFECTIVE" ? "danger" :
    raw === "IN_PROGRESS" || raw === "VERIFYING" || raw === "EVIDENCE_SUBMITTED" || raw === "SUBMITTED" ? "info" :
    raw === "CANCELLED" || raw === "NOT_APPLICABLE" || raw === "ARCHIVED" || raw === "INACTIVE" || raw === "RETIRED" ? "muted" :
    "warning";
  return <span className={`status-badge ${tone}`}>{label || humanStatus(raw)}</span>;
}
