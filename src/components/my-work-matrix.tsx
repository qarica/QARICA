import Link from "next/link";
import { formatDate } from "@/lib/format";
import { EISENHOWER_ACTION, EISENHOWER_LABEL, EISENHOWER_QUADRANTS, EISENHOWER_TONE, workRowQuadrant, type EisenhowerQuadrant } from "@/lib/eisenhower";
import type { MyWorkKanbanRow } from "@/components/my-work-kanban";

const CARD_CAP = 20;

/** Ma trận Eisenhower (Quan trọng × Khẩn cấp) cho việc ĐANG MỞ — cùng dữ liệu và bộ lọc với danh sách. Chỉ xem, thẻ là liên kết mở việc. */
export function MyWorkMatrix({ rows, today }: { rows: MyWorkKanbanRow[]; today: string }) {
  const open = rows.filter((r) => !r.isDone);
  const groups: Record<EisenhowerQuadrant, MyWorkKanbanRow[]> = { P1: [], P2: [], P3: [], P4: [] };
  for (const r of open) groups[workRowQuadrant(r.priority, r.dueDate, today)].push(r);
  for (const q of EISENHOWER_QUADRANTS) groups[q].sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  return (
    <div>
      <p className="mx-note">Quan trọng = ưu tiên Cao/Khẩn; Khẩn cấp = đã quá hạn hoặc hạn trong 2 ngày tới. Chỉ tính việc đang mở.</p>
      <div className="mx-board" aria-label="Ma trận Eisenhower">
        {EISENHOWER_QUADRANTS.map((q) => {
          const items = groups[q];
          const shown = items.slice(0, CARD_CAP);
          return (
            <section key={q} className={`kb-col mx-col tone-${EISENHOWER_TONE[q]}`} aria-label={`${EISENHOWER_LABEL[q]}: ${items.length} việc`}>
              <header className="kb-col-head">
                <strong>{q} · {EISENHOWER_LABEL[q]}</strong>
                <span className="kb-count">{items.length}</span>
              </header>
              <div className="mx-action">{EISENHOWER_ACTION[q]}</div>
              <div className="kb-cards">
                {shown.map((r) => (
                  <Link key={r.key} href={r.href} className={`kb-card ${r.isOverdue ? "late" : ""}`}>
                    <span className="kb-title">{r.title}</span>
                    <span className="kb-meta">{r.typeLabel}</span>
                    <span className="kb-foot">
                      <span className={`status-badge ${r.priorityTone}`}>{r.priorityLabel}</span>
                      <span className="kb-due">{r.dueDate ? `Hạn ${formatDate(r.dueDate)}` : "Chưa có hạn"}</span>
                    </span>
                  </Link>
                ))}
                {!shown.length ? <div className="kb-empty">Không có việc</div> : null}
                {items.length > shown.length ? <div className="kb-more">và {items.length - shown.length} việc nữa — xem ở dạng Danh sách</div> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
