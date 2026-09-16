import { actionCreatePermissions } from "./source-action-policy";

export function taskVerificationPermissions(sourceRecordTypes: string[], hasPlanSource: boolean) {
  const permissions = new Set<string>();
  if (hasPlanSource) permissions.add("plans.manage");
  for (const recordType of sourceRecordTypes) {
    for (const permission of actionCreatePermissions(recordType)) permissions.add(permission);
  }

  // Preserve verification for legacy standalone Actions which predate source links.
  if (!hasPlanSource && sourceRecordTypes.length === 0) permissions.add("plans.manage");
  return Array.from(permissions);
}

export function canVerifyTask(userPermissions: string[], sourceRecordTypes: string[], hasPlanSource: boolean) {
  const allowed = new Set(userPermissions);
  return taskVerificationPermissions(sourceRecordTypes, hasPlanSource).some((permission) => allowed.has(permission));
}

const VERIFIER_LABELS: Record<string, string> = {
  INCIDENT: "QLCL / người có quyền phân loại hoặc điều tra sự cố",
  FINDING: "Người quản lý Finding",
  CAPA: "Người quản lý CAPA",
  RISK: "Người quản lý rủi ro",
  FMEA: "Người quản lý rủi ro/FMEA",
  AUDIT: "Người quản lý Audit/Tracer",
  DIRECTIVE: "Người quản lý chỉ đạo/yêu cầu",
  REPORT: "Người quản lý báo cáo",
  INSPECTION: "Người quản lý đợt kiểm tra",
  IMPROVEMENT_PROPOSAL: "Người quản lý cải tiến",
  IMPROVEMENT_PROJECT: "Người quản lý cải tiến",
  ASSESSMENT: "Người quản lý bộ tiêu chí",
  EXTERNAL_ASSESSMENT: "Người rà soát/điều phối đánh giá ngoài",
  SAFETY_ALERT: "QLCL / người quản lý an toàn",
  FEEDBACK: "Người quản lý phản ánh/góp ý",
};

export function taskStepResponsibility(
  workflowStatus: string,
  assigneeLabel: string,
  sourceRecordTypes: string[],
  hasPlanSource: boolean,
) {
  if (["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(workflowStatus)) {
    const nextAction = workflowStatus === "NOT_STARTED"
      ? "Bắt đầu thực hiện"
      : workflowStatus === "RETURNED"
        ? "Bổ sung theo yêu cầu và gửi lại"
        : "Hoàn thành công việc, nộp minh chứng và gửi xác minh";
    return { step: "Thực hiện", responsible: assigneeLabel || "Người được giao nhiệm vụ", nextAction };
  }
  if (["EVIDENCE_SUBMITTED", "VERIFYING"].includes(workflowStatus)) {
    let responsible = hasPlanSource ? "Người quản lý kế hoạch" : "Người quản lý hồ sơ nguồn";
    const labels = Array.from(new Set(sourceRecordTypes.map((type) => VERIFIER_LABELS[type]).filter(Boolean)));
    if (labels.length === 1) responsible = labels[0];
    return {
      step: "Xác minh",
      responsible,
      nextAction: workflowStatus === "EVIDENCE_SUBMITTED" ? "Tiếp nhận và bắt đầu xác minh" : "Xác minh đạt hoặc trả lại bổ sung",
    };
  }
  if (workflowStatus === "COMPLETED") return { step: "Hoàn tất", responsible: "Không còn bước chờ xử lý", nextAction: "Theo dõi kết quả theo hồ sơ nguồn" };
  if (["CANCELLED", "NOT_APPLICABLE"].includes(workflowStatus)) return { step: "Kết thúc", responsible: "Không còn bước chờ xử lý", nextAction: "Không có" };
  return { step: workflowStatus, responsible: "Chưa xác định", nextAction: "Kiểm tra trạng thái nhiệm vụ" };
}
