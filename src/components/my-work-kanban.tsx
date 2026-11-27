import Link from "next/link";
import { formatDate } from "@/lib/format";
import { WORK_KANBAN_COLUMNS, daysOverdue, groupWorkRows, isWaitingFollowup, type WorkKanbanColumnKey } from "@/lib/my-work-kanban";

export type MyWorkKanbanRow = {
  key: string;
  title: string;
  typeLabel: string;
  relatedTo: string;
  priority: string | null;
  priorityLabel: string;
  priorityTone: string;
  dueDate: string | null;
  completedAt: string | null;
  isDone: boolean;
  isOverdue: boolean;
  followup: unknown;
  href: string;
};

const CARD_CAP = 30;

/** Kanban chỉ xem: mỗi thẻ là liên kết mở việc đó. Cột theo hạn; cùng dữ liệu và bộ lọc với danh sách. */
export function MyWorkKanban({ rows, today }: { rows: MyWorkKanbanRow[]; today: string }) {
  const groups = groupWorkRows(rows, today);
  return (
    <div className="kb-board" aria-label="Việc của tôi theo hạn xử lý">
      {WORK_KANBAN_COLUMNS.map((col) => {
        const items = groups[col.key as WorkKanbanColumnKey];
        const shown = items.slice(0, CARD_CAP);
        return (
          <section key={col.key} className={`kb-col ${col.tone}`} aria-label={`${col.label}: ${items.length} việc`}>
            <header className="kb-col-head" title={col.hint}>
              <strong>{col.label}</strong>
              <span className="kb-count">{items.length}</span>
            </header>
            <div className="kb-cards">
              {shown.map((r) => {
                const late = daysOverdue(r.dueDate, today);
                const f = r.followup as { waiting_for_label?: string } | null;
                return (
                  <Link key={r.key} href={r.href} className={`kb-card ${col.key === "OVERDUE" ? "late" : ""}`}>
                    <span className="kb-title">{r.title}</span>
                    <span className="kb-meta">{r.typeLabel}{r.relatedTo && r.relatedTo !== "—" && !r.typeLabel.includes(r.relatedTo) ? ` · ${r.relatedTo}` : ""}</span>
                    <span className="kb-foot">
                      <span className={`status-badge ${r.priorityTone}`}>{r.priorityLabel}</span>
                      <span className="kb-due">
                        {r.isDone ? (r.completedAt ? `Xong ${formatDate(r.completedAt)}` : "Đã xong") : r.dueDate ? (late > 0 ? `Quá hạn ${late} ngày · ${formatDate(r.dueDate)}` : `Hạn ${formatDate(r.dueDate)}`) : "Chưa có hạn"}
                      </span>
                    </span>
                    {isWaitingFollowup(r.followup) ? <span className="kb-wait">Chờ{f?.waiting_for_label ? `: ${f.waiting_for_label}` : " phản hồi"}</span> : null}
                  </Link>
                );
              })}
              {!shown.length ? <div className="kb-empty">Không có việc</div> : null}
              {items.length > shown.length ? <div className="kb-more">và {items.length - shown.length} việc nữa — xem ở dạng Danh sách</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
