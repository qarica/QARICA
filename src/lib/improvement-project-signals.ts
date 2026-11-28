// Một nguồn tính "đề án cần can thiệp" dùng chung cho trang Danh mục đề án và thanh "Cần xử lý" của nhóm Cải tiến:
// có Action quá hạn, hoặc mốc (milestone) quá hạn, hoặc đã quá ngày kết thúc dự kiến mà đề án chưa đánh giá/đóng.
export const PROJECT_CLOSED = new Set(["EVALUATED", "CLOSED"]);
export const MILESTONE_DONE = new Set(["COMPLETED", "CANCELLED", "NOT_APPLICABLE"]);

export function projectOverdueActions(actions: { workflow_status?: unknown; due_date?: unknown }[], today: string) {
  return actions.filter((a) => !["CANCELLED", "NOT_APPLICABLE"].includes(String(a.workflow_status)) && a.workflow_status !== "COMPLETED" && !!a.due_date && String(a.due_date) < today).length;
}

export function projectOverdueMilestones(milestones: { status?: unknown; due_date?: unknown; planned_end_date?: unknown }[], today: string) {
  return milestones.filter((m) => { const due = m.due_date || m.planned_end_date; return !MILESTONE_DONE.has(String(m.status || "")) && !!due && String(due) < today; }).length;
}

export function isProjectDelayed(input: { overdueActions: number; overdueMilestones: number; target_end_date?: unknown; workflow_status?: unknown }, today: string) {
  return input.overdueActions > 0 || input.overdueMilestones > 0 || (!!input.target_end_date && String(input.target_end_date) < today && !PROJECT_CLOSED.has(String(input.workflow_status)));
}
