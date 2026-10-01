export type EmrCategoryCode =
  | "CHU_KY_SO"
  | "DAO_TAO"
  | "THIET_BI_YTE"
  | "QUY_TRINH"
  | "BIEU_MAU"
  | "LOI"
  | "THIET_BI_CNTT"
  | "PATIENT_PORTAL"
  | "TAI_LIEU_HUONG_DAN";

export type EmrCategory = {
  slug: string;
  code: EmrCategoryCode;
  label: string;
  description: string;
  icon: string;
  // Override for the generic "Mô tả" field's label on the create/edit form
  // and table header for this category — the underlying column (and its
  // value) is unchanged, only the label shown to the user differs, since
  // what that free-text field is actually used for varies by category
  // (e.g. Biểu mẫu uses it to cite the reference document/circular).
  descriptionLabel?: string;
};

// Order here drives the EMR workspace nav strip and overview grid order —
// set per explicit user request, not alphabetical/insertion order.
export const EMR_CATEGORIES: EmrCategory[] = [
  { slug: "quy-trinh", code: "QUY_TRINH", label: "Quy trình", description: "Quy trình nghiệp vụ cần điều chỉnh khi triển khai EMR.", icon: "workflow" },
  { slug: "bieu-mau", code: "BIEU_MAU", label: "Biểu mẫu", description: "Biểu mẫu giấy cần số hóa/điện tử hóa trong EMR.", icon: "file-input", descriptionLabel: "Nguồn tham chiếu" },
  { slug: "loi", code: "LOI", label: "Lỗi", description: "Lỗi và sự cố phát sinh trong quá trình triển khai EMR.", icon: "circle-alert" },
  { slug: "dao-tao", code: "DAO_TAO", label: "Đào tạo", description: "Kế hoạch và tình trạng đào tạo sử dụng EMR cho nhân viên.", icon: "book-open" },
  { slug: "tai-lieu-huong-dan", code: "TAI_LIEU_HUONG_DAN", label: "Tài liệu hướng dẫn", description: "Tài liệu hướng dẫn sử dụng, có thể liên kết tới một biểu mẫu cụ thể (không bắt buộc).", icon: "file-text" },
  { slug: "patient-portal", code: "PATIENT_PORTAL", label: "Patient Portal", description: "Triển khai cổng thông tin tra cứu, đăng ký và kết quả dành cho người bệnh.", icon: "smartphone" },
  { slug: "chu-ky-so", code: "CHU_KY_SO", label: "Chữ ký số", description: "Theo dõi cấp phát, hiệu lực và sự cố chữ ký số phục vụ bệnh án điện tử.", icon: "key-round" },
  { slug: "thiet-bi-cntt", code: "THIET_BI_CNTT", label: "Thiết bị CNTT", description: "Máy tính, mạng và hạ tầng CNTT phục vụ EMR.", icon: "cog" },
  { slug: "thiet-bi-yte", code: "THIET_BI_YTE", label: "Thiết bị y tế", description: "Thiết bị y tế cần kết nối/tương thích với hệ thống EMR.", icon: "network" },
];

export function emrCategoryBySlug(slug: string): EmrCategory | undefined {
  return EMR_CATEGORIES.find((c) => c.slug === slug);
}

// Nhãn KPI đặc thù theo danh mục, nhưng luôn tính từ cùng 1 bộ trường chung
// (status/due_date/details.certificate_expiry) đã có sẵn trên emr_rollout_items —
// không thêm cột/nghiệp vụ mới chỉ để hiển thị số liệu.
export type EmrKpiBucket = "TOTAL" | "DONE" | "IN_PROGRESS" | "TODO" | "BLOCKED" | "OVERDUE" | "CERT_VALID" | "CERT_EXPIRING" | "CERT_EXPIRED";
export type EmrKpi = { bucket: EmrKpiBucket; label: string };

export const EMR_CATEGORY_KPIS: Record<EmrCategoryCode, EmrKpi[]> = {
  CHU_KY_SO: [
    { bucket: "TOTAL", label: "Tổng chứng thư" },
    { bucket: "CERT_VALID", label: "Còn hiệu lực" },
    { bucket: "CERT_EXPIRING", label: "Sắp hết hạn (<30 ngày)" },
    { bucket: "CERT_EXPIRED", label: "Đã hết hạn" },
  ],
  DAO_TAO: [
    { bucket: "TOTAL", label: "Tổng lớp" },
    { bucket: "TODO", label: "Sắp diễn ra" },
    { bucket: "IN_PROGRESS", label: "Đang diễn ra" },
    { bucket: "DONE", label: "Đã hoàn tất" },
  ],
  THIET_BI_YTE: [
    { bucket: "TOTAL", label: "Tổng thiết bị" },
    { bucket: "DONE", label: "Đã kết nối" },
    { bucket: "IN_PROGRESS", label: "Đang triển khai" },
    { bucket: "TODO", label: "Chưa kết nối" },
  ],
  QUY_TRINH: [
    { bucket: "TOTAL", label: "Tổng quy trình" },
    { bucket: "DONE", label: "Đã cập nhật" },
    { bucket: "IN_PROGRESS", label: "Đang rà soát" },
    { bucket: "TODO", label: "Chưa cập nhật" },
  ],
  BIEU_MAU: [
    { bucket: "TOTAL", label: "Tổng biểu mẫu" },
    { bucket: "DONE", label: "Đã số hóa" },
    { bucket: "IN_PROGRESS", label: "Đang triển khai" },
    { bucket: "TODO", label: "Chưa số hóa" },
  ],
  LOI: [
    { bucket: "TOTAL", label: "Tổng lỗi" },
    { bucket: "TODO", label: "Lỗi mới" },
    { bucket: "IN_PROGRESS", label: "Đang xử lý" },
    { bucket: "DONE", label: "Đã khắc phục" },
    { bucket: "OVERDUE", label: "Quá hạn" },
  ],
  THIET_BI_CNTT: [
    { bucket: "TOTAL", label: "Tổng thiết bị" },
    { bucket: "DONE", label: "Đã cấp phát" },
    { bucket: "IN_PROGRESS", label: "Đang triển khai" },
    { bucket: "TODO", label: "Chưa cấp phát" },
  ],
  PATIENT_PORTAL: [
    { bucket: "TOTAL", label: "Tổng tính năng" },
    { bucket: "IN_PROGRESS", label: "Đang triển khai" },
    { bucket: "DONE", label: "Đã hoàn thiện" },
    { bucket: "TODO", label: "Chưa triển khai" },
    { bucket: "BLOCKED", label: "Lỗi / feedback" },
  ],
  TAI_LIEU_HUONG_DAN: [
    { bucket: "TOTAL", label: "Tổng tài liệu" },
    { bucket: "DONE", label: "Đã ban hành" },
    { bucket: "IN_PROGRESS", label: "Đang soạn" },
    { bucket: "TODO", label: "Chưa soạn" },
  ],
};

export const EMR_STATUS_LABELS: Record<string, string> = {
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn tất",
  BLOCKED: "Bị chặn",
};

export type EmrFieldType = "text" | "textarea" | "date" | "number" | "select" | "multiselect" | "reference" | "sequence" | "boolean";
export type EmrField = {
  key: string;
  label: string;
  type: EmrFieldType;
  options?: string[];
  showBeforeTitle?: boolean;
  // For type "reference": this field stores the id of an item in ANOTHER
  // category (e.g. a Lỗi item pointing at the Biểu mẫu item it was filed
  // against). The picker's options are the live items of that category for
  // this organization, fetched the same generic way every category's own
  // list already is (/api/emr/items?category=...) — not a hard-coded list.
  referenceCategory?: EmrCategoryCode;
  // A category with many fields turns into an unreadable wall of table
  // columns (each cell wrapping to several lines). `compact: true` keeps a
  // field fully editable in the create/edit modal but moves it out of its
  // own <th>/<td> column into a per-row expandable "Chi tiết" panel instead
  // — applies to any category, not just the one that first needed it.
  compact?: boolean;
  // Pulls a field out of the normal top-to-bottom modal field order and
  // renders it immediately next to the generic "Trạng thái triển khai"
  // select instead — for a field whose meaning is easily confused with the
  // generic status unless shown side by side (e.g. Biểu mẫu's
  // deployment_phase, a MORE SPECIFIC lifecycle stage, not a duplicate of
  // the generic TODO/IN_PROGRESS/DONE/BLOCKED status).
  pairWithStatus?: boolean;
};

// For type "sequence": an ORDERED list of role picks (e.g. "1. Điều dưỡng
// ký -> 2. Bác sĩ ký -> 3. Trưởng khoa ký"), stored as a single string with
// steps joined by SEQUENCE_SEPARATOR — not free text, each step must be one
// of the field's `options`. Order = array order (no sorting).
export const SEQUENCE_SEPARATOR = " → ";
export function sequenceSteps(raw: unknown): string[] {
  return String(raw ?? "").split(SEQUENCE_SEPARATOR).map((s) => s.trim()).filter(Boolean);
}
export function formatSequenceValue(raw: unknown): string {
  const steps = sequenceSteps(raw);
  if (!steps.length) return "—";
  return steps.map((s, i) => `${i + 1}. ${s}`).join(SEQUENCE_SEPARATOR);
}

// For type "boolean": a single tick (e.g. "Hiển thị trên Patient Portal?"),
// stored as the literal string "true"/"false" — not "" — so an explicit
// "no" is distinguishable from "field was never set" once saved.
export function formatBooleanValue(raw: unknown): string {
  return raw === "true" ? "Có" : "Không";
}

// Which OTHER categories have a "reference" field pointing at `targetCode`.
// Lets a category's own page show "N lỗi liên quan" style reverse-links
// without either side hard-coding the other's existence beyond the one
// `referenceCategory` declaration on the referencing field.
export function categoriesReferencing(targetCode: EmrCategoryCode): { category: EmrCategoryCode; field: EmrField }[] {
  const results: { category: EmrCategoryCode; field: EmrField }[] = [];
  for (const code of Object.keys(EMR_CATEGORY_FIELDS) as EmrCategoryCode[]) {
    for (const field of EMR_CATEGORY_FIELDS[code]) {
      if (field.type === "reference" && field.referenceCategory === targetCode) results.push({ category: code, field });
    }
  }
  return results;
}

// Mỗi danh mục theo dõi một loại thông tin khác nhau trong triển khai EMR thật - không dùng
// chung 1 form cho cả 8 danh mục. Người phụ trách/khoa-phòng/ưu tiên/Go-live gate đã có sẵn
// chung cho mọi danh mục; đây chỉ là các trường ĐẶC THÙ còn thiếu, lưu trong cột `details`.
export const EMR_CATEGORY_FIELDS: Record<EmrCategoryCode, EmrField[]> = {
  CHU_KY_SO: [
    { key: "certificate_expiry", label: "Ngày hết hạn chứng thư số", type: "date" },
    { key: "ca_provider", label: "Nhà cung cấp chứng thư số", type: "text" },
  ],
  DAO_TAO: [
    // Lets a Biểu mẫu marked "Cần đào tạo" create a pre-filled nhiệm vụ đào
    // tạo here (see EmrCreateProvider's prefill mechanism) instead of the
    // trainer re-typing the same form name — the reverse reference back to
    // Biểu mẫu (categoriesReferencing) is what shows "N biểu mẫu liên quan".
    { key: "related_form_id", label: "Biểu mẫu liên quan", type: "reference", referenceCategory: "BIEU_MAU" },
    { key: "training_date", label: "Ngày đào tạo", type: "date" },
    { key: "pass_status", label: "Kết quả", type: "select", options: ["Đạt", "Chưa đạt", "Chưa thi"] },
  ],
  THIET_BI_YTE: [
    { key: "device_name", label: "Tên thiết bị", type: "text" },
    { key: "manufacturer", label: "Hãng sản xuất", type: "text" },
    { key: "connection_status", label: "Tình trạng kết nối EMR", type: "select", options: ["Đã kết nối", "Chưa kết nối"] },
  ],
  QUY_TRINH: [
    { key: "document_ref", label: "Số hiệu văn bản", type: "text" },
    { key: "approved_date", label: "Ngày phê duyệt", type: "date" },
  ],
  BIEU_MAU: [
    { key: "form_code", label: "Mã biểu mẫu", type: "text", showBeforeTitle: true },
    { key: "binding_group", label: "Nhóm gáy", type: "text" },
    { key: "digitized", label: "Tình trạng số hóa", type: "select", options: ["Đã số hóa", "Chưa số hóa"] },
    // Giai đoạn triển khai sau khi số hóa: Demo -> UAT -> Chạy chính thức.
    // Giữ nguyên tắc hạn chế nhập tự do (như QLCL) — chọn từ danh sách cố
    // định, không phải ô text, nên reuse "select" sẵn có thay vì tạo loại
    // field mới.
    { key: "deployment_phase", label: "Giai đoạn triển khai", type: "select", options: ["Demo", "UAT", "Chạy chính thức"], pairWithStatus: true },
    { key: "execution_platform", label: "Nơi thực hiện", type: "text", compact: true },
    { key: "training_required", label: "Yêu cầu đào tạo", type: "select", options: ["Cần đào tạo", "Không cần đào tạo"] },
    { key: "target_roles", label: "Đối tượng thực hiện", type: "multiselect", options: ["Bác sĩ", "Điều dưỡng", "NB/NNNB", "Kế toán", "CSKH", "Giám đốc chuyên môn", "Trưởng khoa", "Kỹ thuật viên", "Phòng hành chính (đóng dấu)", "Khác"], compact: true },
    // Một số biểu mẫu còn cần đóng mộc như một bước trong trình tự ký (sau
    // chữ ký của người có thẩm quyền) — nên "Đóng mộc" là một lựa chọn bước,
    // không phải "Đối tượng thực hiện" (target_roles không có mục này).
    { key: "signing_sequence", label: "Trình tự ký", type: "sequence", options: ["Bác sĩ", "Điều dưỡng", "NB/NNNB", "Kế toán", "CSKH", "Giám đốc chuyên môn", "Trưởng khoa", "Kỹ thuật viên", "Phòng hành chính (đóng dấu)", "Đóng mộc", "Khác"], compact: true },
    { key: "storage_format", label: "Hình thức lưu trữ", type: "multiselect", options: ["Bản điện tử", "Bản giấy", "Scan"], compact: true },
    { key: "notes", label: "Ghi chú", type: "textarea", compact: true },
    { key: "patient_portal_visible", label: "Hiển thị trên Patient Portal", type: "boolean", compact: true },
  ],
  LOI: [
    { key: "related_form_id", label: "Biểu mẫu liên quan", type: "reference", referenceCategory: "BIEU_MAU" },
    { key: "severity", label: "Mức độ", type: "select", options: ["Thấp", "Trung bình", "Cao", "Nghiêm trọng"] },
  ],
  THIET_BI_CNTT: [
    { key: "asset_tag", label: "Mã tài sản", type: "text" },
    { key: "location", label: "Vị trí lắp đặt", type: "text" },
  ],
  PATIENT_PORTAL: [
    { key: "portal_module", label: "Chức năng cổng", type: "text" },
    { key: "rollout_status", label: "Tình trạng triển khai", type: "select", options: ["Đã triển khai", "Đang thử nghiệm", "Chưa triển khai"] },
  ],
  // related_form_id is optional ("không bắt buộc") the same way every other
  // "reference" field already is — the UI never requires a selection and the
  // generic sanitizeDetails() only stores it when a value was actually
  // picked, so a guide document can stand alone or cover a whole process
  // rather than one specific form.
  TAI_LIEU_HUONG_DAN: [
    { key: "related_form_id", label: "Biểu mẫu liên quan", type: "reference", referenceCategory: "BIEU_MAU" },
  ],
};
