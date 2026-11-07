// Phát hành văn bản: 6-stage pipeline + 4 document types, modeled off a real
// reference workflow the user built and ran before. Generalized (no
// hard-coded hospital/department names) per QARICA's multi-organization
// architecture — see supabase/migrations/20261020_document_publications_v1.sql.
export const DOCUMENT_PUBLICATION_STAGES = [
  "REQUESTED",
  "DRAFTING",
  "COLLECTING_FEEDBACK",
  "REVISING",
  "APPROVING",
  "PUBLISHED",
] as const;
// RETRACTED không nằm trong pipeline 6 bước (nextStage() không bao giờ tiến
// tới nó) — đây là trạng thái CUỐI của VĂN BẢN GỐC (target_document_id), gán
// trực tiếp khi 1 yêu cầu loại RETRACT tới PUBLISHED (xem PATCH .../[id]
// route.ts), không phải 1 bước mà chính yêu cầu đó tự đi qua.
export type DocumentPublicationStage = (typeof DOCUMENT_PUBLICATION_STAGES)[number] | "RETRACTED";

export const STAGE_LABEL: Record<DocumentPublicationStage, string> = {
  REQUESTED: "Đề nghị",
  DRAFTING: "Soạn thảo / chỉnh sửa",
  COLLECTING_FEEDBACK: "Góp ý",
  REVISING: "Chỉnh sửa & rà soát",
  APPROVING: "Phê duyệt & trình ký",
  PUBLISHED: "Đã phát hành",
  RETRACTED: "Đã thu hồi",
};

// Số ngày xử lý tối đa của từng bước, dùng tính stage_due_date khi chuyển bước.
export const STAGE_DUE_DAYS: Record<DocumentPublicationStage, number> = {
  REQUESTED: 2,
  DRAFTING: 6,
  COLLECTING_FEEDBACK: 3,
  REVISING: 3,
  APPROVING: 3,
  PUBLISHED: 0,
  RETRACTED: 0,
};

export const DOCUMENT_TYPES = ["OPERATIONAL", "CLINICAL_PROCEDURE", "CLINICAL_PROTOCOL", "NURSING", "CLINICAL_GUIDELINE"] as const;
export type DocumentPublicationType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentPublicationType, string> = {
  OPERATIONAL: "Vận hành",
  CLINICAL_PROCEDURE: "Quy trình kỹ thuật",
  CLINICAL_PROTOCOL: "Phác đồ điều trị",
  NURSING: "Quy trình kỹ thuật chăm sóc",
  CLINICAL_GUIDELINE: "Hướng dẫn chẩn đoán và điều trị",
};

// Cấp phê duyệt tương ứng từng loại tài liệu — chỉ hiển thị để biết hồ sơ cần
// trình ai; Đợt 1 chưa khoá cứng theo vai trò cụ thể (GĐ Điều hành/GĐ Chuyên
// môn), vì QARICA chưa có phân vai Ban Giám đốc ở mức đó — bước Phê duyệt vẫn
// dùng chung quyền document_publication.manage như mọi bước kiểm soát khác.
export const DOCUMENT_TYPE_APPROVER_LABEL: Record<DocumentPublicationType, string> = {
  OPERATIONAL: "GĐ Điều hành",
  CLINICAL_PROCEDURE: "GĐ Chuyên môn",
  CLINICAL_PROTOCOL: "GĐ Chuyên môn",
  NURSING: "GĐ Chuyên môn",
  CLINICAL_GUIDELINE: "GĐ Chuyên môn",
};

export function isDocumentPublicationStage(value: unknown): value is DocumentPublicationStage {
  return typeof value === "string" && ((DOCUMENT_PUBLICATION_STAGES as readonly string[]).includes(value) || value === "RETRACTED");
}

// "Nếu a muốn cập nhật hay thu hồi hay viết mới đều phải qua đề nghị văn bản
// mới. Có thể đổi thành Tạo yêu cầu" — đối chiếu với QT.06 (quy trình thật,
// lưu đồ 4.2/4.4/4.5): 1 yêu cầu ("Tạo yêu cầu") có 3 loại. NEW/UPDATE đi đủ
// pipeline 6 bước (soạn thảo→góp ý→rà soát→phê duyệt→trình ký→phát hành).
// RETRACT chỉ qua đúng 1 bước duyệt (REQUESTED) rồi thực hiện ngay — xem
// nextStage() bên dưới. Hiệu ứng áp dụng lúc chạm PUBLISHED: NEW tự nó trở
// thành văn bản; UPDATE/RETRACT áp hiệu ứng lên target_document_id (văn bản
// ĐÃ PUBLISHED được chọn lúc tạo yêu cầu).
export const REQUEST_TYPES = ["NEW", "UPDATE", "RETRACT"] as const;
export type DocumentPublicationRequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_TYPE_LABEL: Record<DocumentPublicationRequestType, string> = {
  NEW: "Văn bản mới",
  UPDATE: "Cập nhật phiên bản",
  RETRACT: "Thu hồi",
};

export function isRequestType(value: unknown): value is DocumentPublicationRequestType {
  return typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value);
}
export function isDocumentPublicationType(value: unknown): value is DocumentPublicationType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

// Hình thức phổ biến, chọn lúc Phát hành — mô phỏng lại "Phiếu xác nhận
// thông hiểu tài liệu" thực tế (2 hình thức: Tự đọc hiểu / Được đào tạo).
export const DISSEMINATION_TYPES = ["SELF_READ", "TRAINING_REQUIRED"] as const;
export type DisseminationType = (typeof DISSEMINATION_TYPES)[number];

export const DISSEMINATION_TYPE_LABEL: Record<DisseminationType, string> = {
  SELF_READ: "Tự đọc hiểu",
  TRAINING_REQUIRED: "Cần đào tạo",
};

export function isDisseminationType(value: unknown): value is DisseminationType {
  return typeof value === "string" && (DISSEMINATION_TYPES as readonly string[]).includes(value);
}

// Theo đúng quy trình thực tế (QT.06, lưu đồ 4.2/4.4/4.5): "Thu hồi tài
// liệu" KHÔNG đi qua soạn thảo/góp ý/rà soát/phê duyệt/trình ký như viết
// mới/sửa đổi — sau khi "Duyệt yêu cầu" (REQUESTED, 2 ngày) là thực hiện
// thu hồi ngay. requestType="RETRACT" ở REQUESTED nên nhảy thẳng tới
// PUBLISHED (bước mà PATCH .../[id] route.ts áp hiệu ứng thu hồi lên
// target_document_id), bỏ qua 4 bước giữa — NEW/UPDATE vẫn đi đủ 6 bước.
export function nextStage(stage: DocumentPublicationStage, requestType?: DocumentPublicationRequestType): DocumentPublicationStage | null {
  if (requestType === "RETRACT" && stage === "REQUESTED") return "PUBLISHED";
  const idx = (DOCUMENT_PUBLICATION_STAGES as readonly string[]).indexOf(stage);
  if (idx < 0 || idx === DOCUMENT_PUBLICATION_STAGES.length - 1) return null;
  return DOCUMENT_PUBLICATION_STAGES[idx + 1];
}

// Nhãn "Đang xử lý" hiển thị trên danh sách — ai/đơn vị nào đang giữ hồ sơ ở
// bước hiện tại. PUBLISHED không còn ai xử lý (đã xong, rời "Việc cần làm").
export function currentOwnerLabel(stage: DocumentPublicationStage, documentType: DocumentPublicationType, draftingDepartmentName: string | null): string | null {
  switch (stage) {
    case "REQUESTED":
    case "DRAFTING":
      return draftingDepartmentName || "Đơn vị soạn thảo";
    case "COLLECTING_FEEDBACK":
      return "Đơn vị liên quan (góp ý)";
    case "REVISING":
      return "Đơn vị kiểm soát tài liệu";
    case "APPROVING":
      return DOCUMENT_TYPE_APPROVER_LABEL[documentType];
    case "PUBLISHED":
    case "RETRACTED":
      return null;
  }
}
