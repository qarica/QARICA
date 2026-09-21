export type GateResult = { ok: true } | { ok: false; error: string };

export function findingSubmitGate(input: { actionCount: number; unfinishedActionCount: number; evidenceCount: number }): GateResult {
  if (input.actionCount < 1) return { ok: false, error: "Finding phải có ít nhất 01 Action khắc phục trước khi gửi xác minh." };
  if (input.unfinishedActionCount > 0) return { ok: false, error: `Còn ${input.unfinishedActionCount} Action chưa hoàn thành.` };
  if (input.evidenceCount < 1) return { ok: false, error: "Cần có ít nhất 01 minh chứng khắc phục trước khi gửi xác minh." };
  return { ok: true };
}

export function capaEffectivenessGate(input: { incompleteActionCount: number; evidenceCount: number; hasRequiredResources?: boolean }): GateResult {
  if (input.incompleteActionCount > 0) return { ok: false, error: `Còn ${input.incompleteActionCount} Action chưa hoàn thành.` };
  if (input.evidenceCount < 1) return { ok: false, error: "Cần ít nhất 01 minh chứng trước đánh giá hiệu lực." };
  if (input.hasRequiredResources === false) return { ok: false, error: "Cần khai báo nguồn lực cần trước đánh giá hiệu lực." };
  return { ok: true };
}

export function externalComparisonCloseGate(input: { hasComparison: boolean; evidenceCount: number; openFindingCount: number }): GateResult {
  if (!input.hasComparison || input.evidenceCount < 1) return { ok: false, error: "Cần có đợt tự đánh giá đối chiếu và ít nhất một minh chứng/báo cáo đoàn ngoài." };
  if (input.openFindingCount > 0) return { ok: false, error: `Còn ${input.openFindingCount} Finding chênh lệch chưa recheck/đóng.` };
  return { ok: true };
}

export function inspectionCloseGate(input: { incompleteActionCount: number; evidenceCount: number; hasConclusion: boolean }): GateResult {
  if (input.incompleteActionCount > 0) return { ok: false, error: `Còn ${input.incompleteActionCount} Action countdown/chuyển giao chưa hoàn thành.` };
  if (input.evidenceCount < 1) return { ok: false, error: "Cần minh chứng kết quả tiếp đoàn trước khi đóng." };
  if (!input.hasConclusion) return { ok: false, error: "Kết luận đóng đợt tiếp đoàn là bắt buộc." };
  return { ok: true };
}

export function incidentReadyToCloseGate(input: { actionCount: number; incompleteActionCount: number; evidenceCount: number; isSerious?: boolean; hasCapa?: boolean; noActionRequired?: boolean; noActionReason?: string }): GateResult {
  if (input.actionCount < 1 && !input.noActionRequired) return { ok: false, error: "Cần ít nhất 01 Action phòng ngừa/khắc phục, hoặc xác nhận không cần Action kèm lý do." };
  if (input.noActionRequired && !String(input.noActionReason || "").trim()) return { ok: false, error: "Cần ghi rõ lý do không cần Action bổ sung." };
  if (input.isSerious && input.noActionRequired) return { ok: false, error: "Sự cố nghiêm trọng không được bỏ qua Action/CAPA." };
  if (input.incompleteActionCount > 0) return { ok: false, error: `Còn ${input.incompleteActionCount} Action chưa hoàn thành.` };
  if (input.evidenceCount < 1) return { ok: false, error: "Cần ít nhất 01 minh chứng xử lý sự cố." };
  if (input.isSerious && !input.hasCapa) return { ok: false, error: "Sự cố nghiêm trọng (NC3) phải có CAPA gắn kèm (không chỉ Action thường) trước khi đóng." };
  return { ok: true };
}

export function actionSubmitGate(input: { evidenceCount: number }): GateResult {
  if (input.evidenceCount < 1) return { ok: false, error: "Cần nộp ít nhất 01 minh chứng trước khi gửi xác minh." };
  return { ok: true };
}
