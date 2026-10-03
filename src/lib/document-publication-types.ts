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
export type DocumentPublicationStage = (typeof DOCUMENT_PUBLICATION_STAGES)[number];

export const STAGE_LABEL: Record<DocumentPublicationStage, string> = {
  REQUESTED: "Đề nghị",
  DRAFTING: "Soạn thảo / chỉnh sửa",
  COLLECTING_FEEDBACK: "Góp ý",
  REVISING: "Chỉnh sửa & rà soát",
  APPROVING: "Phê duyệt & trình ký",
  PUBLISHED: "Đã phát hành",
};

// Số ngày xử lý tối đa của từng bước, dùng tính stage_due_date khi chuyển bước.
export const STAGE_DUE_DAYS: Record<DocumentPublicationStage, number> = {
  REQUESTED: 2,
  DRAFTING: 6,
  COLLECTING_FEEDBACK: 3,
  REVISING: 3,
  APPROVING: 3,
  PUBLISHED: 0,
};

export const DOCUMENT_TYPES = ["OPERATIONAL", "CLINICAL_PROCEDURE", "CLINICAL_PROTOCOL", "NURSING"] as const;
export type DocumentPublicationType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentPublicationType, string> = {
  OPERATIONAL: "Vận hành",
  CLINICAL_PROCEDURE: "Chuyên môn khối BS — Quy trình kỹ thuật & Hướng dẫn điều trị",
  CLINICAL_PROTOCOL: "Chuyên môn khối BS — Phác đồ điều trị",
  NURSING: "Chuyên môn khối Điều dưỡng / Hộ sinh / KTV",
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
};

export function isDocumentPublicationStage(value: unknown): value is DocumentPublicationStage {
  return typeof value === "string" && (DOCUMENT_PUBLICATION_STAGES as readonly string[]).includes(value);
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

export function nextStage(stage: DocumentPublicationStage): DocumentPublicationStage | null {
  const idx = DOCUMENT_PUBLICATION_STAGES.indexOf(stage);
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
      return null;
  }
}
