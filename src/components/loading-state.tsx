import { Icon } from "@/components/icon";

// Real finding: .empty-state was used for BOTH "no data" and "still loading"
// across ~108/121 components — a blank page while data is fetching reads as
// "không có dữ liệu" instead of "đang tải". This is the shared primitive to
// adopt going forward; existing call sites migrate incrementally as each is
// touched, not as one disruptive mass rewrite.
export function LoadingState({ label = "Đang tải...", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <Icon name="refresh-cw" size={18} />
      <span>{label}</span>
    </div>
  );
}
