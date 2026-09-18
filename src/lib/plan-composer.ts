export const PLAN_TYPES = new Set(["ANNUAL_PLAN", "THEMATIC_PLAN", "DEPARTMENT_PLAN", "PROGRAM", "OTHER"]);
export const PLAN_ACTION_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]);
export const PLAN_AUTOMATION_KINDS = new Set(["ACTION", "INDICATOR", "MONITORING", "REPORT", "ASSESSMENT", "AUDIT", "IMPROVEMENT"]);

export type PlanAutomationOutput = {
  kind: "INDICATOR" | "MONITORING" | "REPORT" | "ASSESSMENT" | "AUDIT" | "IMPROVEMENT";
  ref_id: string | null;
  target_department_id: string | null;
  target_area: string | null;
  monitoring_recurrence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  monitoring_recurrence_end_date: string | null;
  report_recipient: string | null;
  report_method: string | null;
  report_period: string | null;
  report_recurrence_rule: string | null;
  report_recurrence_end_date: string | null;
  assessment_round_type: string | null;
  audit_type: string | null;
};

export type PlanDraftAction = {
  client_id: string;
  title: string;
  description: string | null;
  priority: string;
  lead_department_id: string | null;
  collaborating_department_ids: string[];
  collaborating_group_ids: string[];
  collaborating_user_ids: string[];
  parent_client_id: string | null;
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
  automation_outputs: PlanAutomationOutput[];
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
export function cleanPlanList(value: unknown): string[] { return Array.isArray(value) ? value.map(planText).filter(Boolean).slice(0, 100) : []; }
function cleanPlanIdList(value: unknown, limit: number): string[] { return Array.isArray(value) ? Array.from(new Set(value.map(planText).filter(Boolean))).slice(0, limit) : []; }
export function cleanPlanAutomationOutputs(raw: any): PlanAutomationOutput[] {
  const validKinds = new Set(["INDICATOR","MONITORING","REPORT","ASSESSMENT","AUDIT","IMPROVEMENT"]);
  const normalize = (row: any): PlanAutomationOutput | null => {
    const kind = planText(row?.kind).toUpperCase();
    if (!validKinds.has(kind)) return null;
    return {
      kind: kind as PlanAutomationOutput["kind"],
      ref_id: planText(row?.ref_id) || null,
      target_department_id: planText(row?.target_department_id) || null,
      target_area: planText(row?.target_area) || null,
      monitoring_recurrence: ["DAILY","WEEKLY","MONTHLY","QUARTERLY","YEARLY"].includes(planText(row?.monitoring_recurrence).toUpperCase())
        ? planText(row?.monitoring_recurrence).toUpperCase() as PlanAutomationOutput["monitoring_recurrence"]
        : "ONCE",
      monitoring_recurrence_end_date: planText(row?.monitoring_recurrence_end_date) || null,
      report_recipient: planText(row?.report_recipient) || null,
      report_method: planText(row?.report_method) || null,
      report_period: planText(row?.report_period) || null,
      report_recurrence_rule: planText(row?.report_recurrence_rule).toUpperCase() || null,
      report_recurrence_end_date: planText(row?.report_recurrence_end_date) || null,
      assessment_round_type: planText(row?.assessment_round_type) || null,
      audit_type: planText(row?.audit_type) || null,
    };
  };

  let rows = Array.isArray(raw?.automation_outputs)
    ? raw.automation_outputs.map(normalize).filter((x: PlanAutomationOutput | null): x is PlanAutomationOutput => !!x)
    : [];

  if (!rows.length && raw?.automation_confirmed === true) {
    const legacyKind = planText(raw?.automation_kind).toUpperCase();
    if (validKinds.has(legacyKind)) {
      rows = [{
        kind: legacyKind as PlanAutomationOutput["kind"],
        ref_id: planText(raw?.automation_ref_id) || null,
        target_department_id: planText(raw?.automation_target_department_id) || null,
        target_area: planText(raw?.automation_target_area) || null,
        monitoring_recurrence: "ONCE",
        monitoring_recurrence_end_date: null,
        report_recipient: planText(raw?.automation_report_recipient) || null,
        report_method: planText(raw?.automation_report_method) || null,
        report_period: planText(raw?.automation_report_period) || null,
        report_recurrence_rule: planText(raw?.automation_report_recurrence_rule).toUpperCase() || null,
        report_recurrence_end_date: planText(raw?.automation_report_recurrence_end_date) || null,
        assessment_round_type: planText(raw?.automation_assessment_round_type) || null,
        audit_type: planText(raw?.automation_audit_type) || null,
      }];
    }
  }

  const deduped = new Map<PlanAutomationOutput["kind"], PlanAutomationOutput>();
  for (const row of rows) if (!deduped.has(row.kind)) deduped.set(row.kind, row);
  return Array.from(deduped.values()).slice(0, 6);
}

export function cleanPlanDraftActions(value: unknown): PlanDraftAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((raw: any, index) => {
    const automationOutputs = cleanPlanAutomationOutputs(raw);
    const firstOutput = automationOutputs[0] || null;
    const legacyKind = PLAN_AUTOMATION_KINDS.has(planText(raw?.automation_kind).toUpperCase())
      ? planText(raw?.automation_kind).toUpperCase() as PlanDraftAction["automation_kind"]
      : "ACTION";
    return {
      client_id: planText(raw?.client_id) || `draft-${index + 1}`,
      title: planText(raw?.title),
      description: planText(raw?.description) || null,
      priority: planText(raw?.priority || "NORMAL").toUpperCase(),
      lead_department_id: planText(raw?.lead_department_id) || null,
      collaborating_department_ids: cleanPlanIdList(raw?.collaborating_department_ids, 50),
      collaborating_group_ids: cleanPlanIdList(raw?.collaborating_group_ids, 50),
      collaborating_user_ids: cleanPlanIdList(raw?.collaborating_user_ids, 100),
      parent_client_id: planText(raw?.parent_client_id) || null,
      assignee_user_id: planText(raw?.assignee_user_id) || null,
      start_date: planText(raw?.start_date) || null,
      due_date: planText(raw?.due_date) || null,
      expected_result: planText(raw?.expected_result),
      verification_requirement: planText(raw?.verification_requirement) || null,
      milestone_group: planText(raw?.milestone_group) || null,
      is_required: raw?.is_required !== false,
      criteria_refs: Array.isArray(raw?.criteria_refs) ? raw.criteria_refs.slice(0, 50) : [],
      automation_kind: firstOutput?.kind || legacyKind,
      automation_confirmed: automationOutputs.length > 0 || raw?.automation_confirmed === true,
      automation_outputs: automationOutputs,
      automation_ref_id: firstOutput?.ref_id ?? (planText(raw?.automation_ref_id) || null),
      automation_target_department_id: firstOutput?.target_department_id ?? (planText(raw?.automation_target_department_id) || null),
      automation_target_area: firstOutput?.target_area ?? (planText(raw?.automation_target_area) || null),
      automation_report_recipient: firstOutput?.report_recipient ?? (planText(raw?.automation_report_recipient) || null),
      automation_report_method: firstOutput?.report_method ?? (planText(raw?.automation_report_method) || null),
      automation_report_period: firstOutput?.report_period ?? (planText(raw?.automation_report_period) || null),
      automation_report_recurrence_rule: firstOutput?.report_recurrence_rule ?? (planText(raw?.automation_report_recurrence_rule) || null),
      automation_report_recurrence_end_date: firstOutput?.report_recurrence_end_date ?? (planText(raw?.automation_report_recurrence_end_date) || null),
      automation_assessment_round_type: firstOutput?.assessment_round_type ?? (planText(raw?.automation_assessment_round_type) || null),
      automation_audit_type: firstOutput?.audit_type ?? (planText(raw?.automation_audit_type) || null),
    };
  });
}

export function validatePlanAutomationOutput(output: PlanAutomationOutput, dueDate: string | null, planEnd: string | null, verificationRequirement: string | null) {
  if (output.kind === "INDICATOR" && !output.ref_id) return "Chỉ số cần chọn chỉ số hiện có.";
  if (output.kind === "MONITORING" && !output.ref_id) return "Đợt giám sát cần chọn bảng kiểm đã phát hành.";
  if (output.kind === "MONITORING" && !output.target_department_id && !output.target_area) return "Đợt giám sát cần khoa/phòng hoặc phạm vi được giám sát.";
  if (output.kind === "MONITORING" && output.monitoring_recurrence !== "ONCE" && !verificationRequirement) return "Giám sát định kỳ cần Yêu cầu minh chứng để mỗi kỳ có tiêu chí hoàn thành rõ ràng.";
  if (output.kind === "MONITORING" && output.monitoring_recurrence !== "ONCE" && !output.monitoring_recurrence_end_date && !planEnd) return "Giám sát định kỳ cần ngày kết thúc lịch hoặc ngày kết thúc kế hoạch.";
  if (output.kind === "MONITORING" && output.monitoring_recurrence_end_date && dueDate && output.monitoring_recurrence_end_date < dueDate) return "Ngày kết thúc lịch giám sát không được trước đợt đầu tiên.";
  if (output.kind === "ASSESSMENT" && !output.ref_id) return "Tự đánh giá cần chọn bộ tiêu chí đã phát hành.";
  if (output.kind === "REPORT" && !output.report_recipient) return "Báo cáo cần nơi nhận.";
  if (output.kind === "REPORT" && !output.report_method) return "Báo cáo cần phương thức gửi.";
  if (output.kind === "REPORT" && !output.report_period) return "Báo cáo cần xác định kỳ báo cáo.";
  if (output.kind === "REPORT" && output.report_recurrence_end_date && dueDate && output.report_recurrence_end_date < dueDate) return "Ngày kết thúc chu kỳ báo cáo không được trước hạn báo cáo đầu tiên.";
  if (output.kind === "AUDIT" && !output.audit_type) return "Audit/Tracer cần xác định loại đánh giá.";
  return null;
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
  for (const output of action.automation_outputs) {
    const outputError = validatePlanAutomationOutput(output, action.due_date, planEnd, action.verification_requirement);
    if (outputError) return `${output.kind}: ${outputError}`;
  }
  return null;
}
export function planComposerReady(input: { generalObjective?: unknown; specificObjectives?: unknown; requirements?: unknown; draftActions?: unknown; startDate?: string | null; endDate?: string | null }) {
  const actions = cleanPlanDraftActions(input.draftActions);
  const startDate = input.startDate || null, endDate = input.endDate || null;
  return validPlanDateWindow(startDate, endDate) && !!planText(input.generalObjective) && actions.length > 0 && actions.every((action) => !validatePlanDraftAction(action, startDate, endDate));
}
