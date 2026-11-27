// Kanban "Việc của tôi": cách xem khác của CÙNG danh sách đang lọc (tab, tìm kiếm, tuần), xếp cột theo hạn xử lý.
// Hàm thuần (không import "@/...") để kiểm thử. Chỉ xem: không đổi trạng thái việc (mỗi nguồn việc có quy trình riêng:
// Action cần minh chứng, hạng mục EMR có cổng Go-live DONE + minh chứng + xác minh) nên đổi trạng thái vẫn làm ở trang chi tiết.

export type WorkKanbanColumnKey = "OVERDUE" | "TODAY" | "NEXT7" | "LATER" | "WAITING" | "DONE";

export const WORK_KANBAN_COLUMNS: { key: WorkKanbanColumnKey; label: string; hint: string; tone: "danger" | "warning" | "info" | "muted" | "wait" | "success" }[] = [
  { key: "OVERDUE", label: "Quá hạn", hint: "Hạn đã qua, chưa xong — xử lý trước", tone: "danger" },
  { key: "TODAY", label: "Hôm nay", hint: "Đến hạn hôm nay", tone: "warning" },
  { key: "NEXT7", label: "7 ngày tới", hint: "Hạn trong 7 ngày tới", tone: "info" },
  { key: "LATER", label: "Sau này / chưa có hạn", hint: "Hạn xa hơn 7 ngày hoặc chưa đặt hạn", tone: "muted" },
  { key: "WAITING", label: "Chờ phản hồi", hint: "Đang đợi người khác phản hồi hoặc hoàn thành phần việc liên quan", tone: "wait" },
  { key: "DONE", label: "Đã hoàn thành", hint: "Việc đã xong, mới nhất trước", tone: "success" },
];

export type WorkKanbanRow = {
  dueDate: string | null;
  completedAt: string | null;
  isDone: boolean;
  isOverdue?: boolean;
  followup?: unknown;
};

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isWaitingFollowup(followup: unknown): boolean {
  return !!followup && typeof followup === "object" && (followup as { state?: unknown }).state === "WAITING";
}

/** Mỗi việc nằm đúng 1 cột. Ưu tiên: Hoàn thành > Chờ phản hồi > Quá hạn > Hôm nay > 7 ngày tới > Sau này/chưa có hạn. */
export function workKanbanColumn(row: WorkKanbanRow, today: string): WorkKanbanColumnKey {
  if (row.isDone) return "DONE";
  if (isWaitingFollowup(row.followup)) return "WAITING";
  if (row.isOverdue || (row.dueDate && row.dueDate < today)) return "OVERDUE";
  if (!row.dueDate) return "LATER";
  if (row.dueDate === today) return "TODAY";
  if (row.dueDate <= addDaysIso(today, 7)) return "NEXT7";
  return "LATER";
}

export function groupWorkRows<T extends WorkKanbanRow>(rows: T[], today: string): Record<WorkKanbanColumnKey, T[]> {
  const out: Record<WorkKanbanColumnKey, T[]> = { OVERDUE: [], TODAY: [], NEXT7: [], LATER: [], WAITING: [], DONE: [] };
  for (const r of rows) out[workKanbanColumn(r, today)].push(r);
  const byDue = (a: T, b: T) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
  for (const k of ["OVERDUE", "TODAY", "NEXT7", "LATER", "WAITING"] as const) out[k].sort(byDue);
  out.DONE.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  return out;
}

/** Số ngày quá hạn (dương) so với hôm nay; 0 nếu chưa quá hạn hoặc không có hạn. */
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0;
  const a = Date.parse(`${dueDate}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}
