export const PLAN_TYPES = new Set(["ANNUAL_PLAN", "THEMATIC_PLAN", "DEPARTMENT_PLAN", "PROGRAM", "OTHER"]);
export const PLAN_ACTION_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
export const PLAN_AUTOMATION_KINDS = new Set(["ACTION", "INDICATOR", "MONITORING", "REPORT", "ASSESSMENT", "AUDIT", "IMPROVEMENT"]);

export type PlanDraftAction = {
  client_id: string;
  title: string;
  description: string | null;
  priority: string;
  lead_department_id: string | null;
  collaborating_department_ids: string[];
  assignee_user_id: string | null;
  start_date: string | null;
  due_date: string | null;
  expected_result: string;
  verification_requirement: string | null;
  milestone_group: string | null;
  is_required: boolean;
  criteria_refs: unknown[];
  automation_kind: "ACTION" | "INDICATOR" | "MONITORING" | "REPORT" | "ASSESSMENT" | "AUDIT" | "IMPROVEMENT";
  automation_confirmed: boolean;
  automation_ref_id: string | null;
  automation_target_department_id: string | null;
  automation_target_area: string | null;
  automation_report_recipient: string | null;
  automation_report_method: string | null;
  automation_report_period: string | null;
  automation_report_recurrence_rule: string | null;
  automation_report_recurrence_end_date: string | null;
  automation_assessment_round_type: string | null;
  automation_audit_type: string | null;
};

export const planText = (value: unknown) => String(value ?? "").trim();
export function cleanPlanList(value: unknown) { return Array.isArray(value) ? value.map(planText).filter(Boolean).slice(0, 100) : []; }
export function cleanPlanDraftActions(value: unknown): PlanDraftAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((raw: any, index) => ({
    client_id: planText(raw?.client_id) || `draft-${index + 1}`, title: planText(raw?.title), description: planText(raw?.description) || null,
    priority: planText(raw?.priority || "NORMAL").toUpperCase(), lead_department_id: planText(raw?.lead_department_id) || null,
    collaborating_department_ids: Array.isArray(raw?.collaborating_department_ids) ? raw.collaborating_department_ids.filter((x: unknown): x is string => typeof x === "string" && !!x) : [],
    assignee_user_id: planText(raw?.assignee_user_id) || null, start_date: planText(raw?.start_date) || null, due_date: planText(raw?.due_date) || null,
    expected_result: planText(raw?.expected_result), verification_requirement: planText(raw?.verification_requirement) || null, milestone_group: planText(raw?.milestone_group) || null,
    is_required: raw?.is_required !== false, criteria_refs: Array.isArray(raw?.criteria_refs) ? raw.criteria_refs.slice(0, 50) : [],
    automation_kind: PLAN_AUTOMATION_KINDS.has(planText(raw?.automation_kind).toUpperCase()) ? planText(raw?.automation_kind).toUpperCase() as PlanDraftAction["automation_kind"] : "ACTION",
    automation_confirmed: raw?.automation_confirmed === true,
    automation_ref_id: planText(raw?.automation_ref_id) || null,
    automation_target_department_id: planText(raw?.automation_target_department_id) || null,
    automation_target_area: planText(raw?.automation_target_area) || null,
    automation_report_recipient: planText(raw?.automation_report_recipient) || null,
    automation_report_method: planText(raw?.automation_report_method) || null,
    automation_report_period: planText(raw?.automation_report_period) || null,
    automation_report_recurrence_rule: planText(raw?.automation_report_recurrence_rule) || null,
    automation_report_recurrence_end_date: planText(raw?.automation_report_recurrence_end_date) || null,
    automation_assessment_round_type: planText(raw?.automation_assessment_round_type) || null,
    automation_audit_type: planText(raw?.automation_audit_type) || null,
  }));
}
export function canEditPlanContent(status: unknown) { return planText(status).toUpperCase() === "DRAFT"; }
export function validPlanDateWindow(startDate: string | null, endDate: string | null) { return !(startDate && endDate && endDate < startDate); }
export function validatePlanDraftAction(action: PlanDraftAction, planStart: string | null, planEnd: string | null) {
  if (!action.title) return "Nội dung nhiệm vụ là bắt buộc.";
  if (!PLAN_ACTION_PRIORITIES.has(action.priority)) return "Mức ưu tiên nhiệm vụ không hợp lệ.";
  if (!action.lead_department_id) return "Mỗi nhiệm vụ cần khoa/phòng phụ trách.";
  if (!action.assignee_user_id) return "Mỗi nhiệm vụ cần người phụ trách.";
  if (!action.due_date) return "Mỗi nhiệm vụ cần hạn hoàn thành.";
  if (!action.expected_result) return "Mỗi nhiệm vụ cần kết quả mong đợi.";
  if (action.start_date && action.due_date < action.start_date) return "Hạn nhiệm vụ không được trước ngày bắt đầu.";
  if (planStart && action.start_date && action.start_date < planStart) return "Ngày bắt đầu nhiệm vụ nằm ngoài thời gian kế hoạch.";
  if (planEnd && action.due_date > planEnd) return "Hạn nhiệm vụ nằm ngoài thời gian kế hoạch.";
  if (action.automation_confirmed && action.automation_kind === "INDICATOR" && !action.automation_ref_id) return "Đã xác nhận tạo Chỉ số nhưng chưa chọn chỉ số hiện có.";
  if (action.automation_confirmed && action.automation_kind === "MONITORING" && !action.automation_ref_id) return "Đã xác nhận tạo Đợt giám sát nhưng chưa chọn bảng kiểm đã phát hành.";
  if (action.automation_confirmed && action.automation_kind === "MONITORING" && !action.automation_target_department_id && !action.automation_target_area) return "Đợt giám sát cần khoa/phòng hoặc phạm vi được giám sát.";
  if (action.automation_confirmed && action.automation_kind === "ASSESSMENT" && !action.automation_ref_id) return "Tự đánh giá cần chọn bộ tiêu chí đã phát hành.";
  if (action.automation_confirmed && action.automation_kind === "REPORT" && !action.automation_report_recipient) return "Báo cáo cần nơi nhận.";
  if (action.automation_confirmed && action.automation_kind === "REPORT" && !action.automation_report_method) return "Báo cáo cần phương thức gửi.";
  if (action.automation_confirmed && action.automation_kind === "REPORT" && !action.automation_report_period) return "Báo cáo cần xác định kỳ báo cáo.";
  if (action.automation_confirmed && action.automation_kind === "REPORT" && action.automation_report_recurrence_end_date && action.due_date && action.automation_report_recurrence_end_date < action.due_date) return "Ngày kết thúc chu kỳ báo cáo không được trước hạn báo cáo đầu tiên.";
  if (action.automation_confirmed && action.automation_kind === "AUDIT" && !action.automation_audit_type) return "Audit/Tracer cần xác định loại đánh giá.";
  return null;
}
export function planComposerReady(input: { generalObjective?: unknown; specificObjectives?: unknown; requirements?: unknown; draftActions?: unknown; startDate?: string | null; endDate?: string | null }) {
  const actions = cleanPlanDraftActions(input.draftActions);
  const startDate = input.startDate || null, endDate = input.endDate || null;
  return validPlanDateWindow(startDate, endDate) && !!planText(input.generalObjective) && cleanPlanList(input.specificObjectives).length > 0 && !!planText(input.requirements) && actions.length > 0 && actions.every((action) => !validatePlanDraftAction(action, startDate, endDate));
}
