export type EmrCategoryCode =
  | "CHU_KY_SO"
  | "NHAP_LIEU"
  | "DAO_TAO"
  | "THIET_BI_YTE"
  | "QUY_TRINH"
  | "BIEU_MAU"
  | "LOI"
  | "THIET_BI_CNTT";

export type EmrCategory = {
  slug: string;
  code: EmrCategoryCode;
  label: string;
  description: string;
  icon: string;
};

export const EMR_CATEGORIES: EmrCategory[] = [
  { slug: "chu-ky-so", code: "CHU_KY_SO", label: "Chữ ký số", description: "Theo dõi cấp phát, hiệu lực và sự cố chữ ký số phục vụ bệnh án điện tử.", icon: "key-round" },
  { slug: "nhap-lieu", code: "NHAP_LIEU", label: "Nhập liệu", description: "Tiến độ và vướng mắc nhập liệu hồ sơ vào hệ thống EMR.", icon: "file-text" },
  { slug: "dao-tao", code: "DAO_TAO", label: "Đào tạo", description: "Kế hoạch và tình trạng đào tạo sử dụng EMR cho nhân viên.", icon: "book-open" },
  { slug: "thiet-bi-yte", code: "THIET_BI_YTE", label: "Thiết bị y tế", description: "Thiết bị y tế cần kết nối/tương thích với hệ thống EMR.", icon: "network" },
  { slug: "quy-trinh", code: "QUY_TRINH", label: "Quy trình", description: "Quy trình nghiệp vụ cần điều chỉnh khi triển khai EMR.", icon: "workflow" },
  { slug: "bieu-mau", code: "BIEU_MAU", label: "Biểu mẫu", description: "Biểu mẫu giấy cần số hóa/điện tử hóa trong EMR.", icon: "file-input" },
  { slug: "loi", code: "LOI", label: "Lỗi", description: "Lỗi và sự cố phát sinh trong quá trình triển khai EMR.", icon: "circle-alert" },
  { slug: "thiet-bi-cntt", code: "THIET_BI_CNTT", label: "Thiết bị CNTT", description: "Máy tính, mạng và hạ tầng CNTT phục vụ EMR.", icon: "cog" },
];

export function emrCategoryBySlug(slug: string): EmrCategory | undefined {
  return EMR_CATEGORIES.find((c) => c.slug === slug);
}

export const EMR_STATUS_LABELS: Record<string, string> = {
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn tất",
  BLOCKED: "Bị chặn",
};

export type EmrFieldType = "text" | "date" | "number" | "select";
export type EmrField = { key: string; label: string; type: EmrFieldType; options?: string[] };

// Mỗi danh mục theo dõi một loại thông tin khác nhau trong triển khai EMR thật - không dùng
// chung 1 form cho cả 8 danh mục. Người phụ trách/khoa-phòng/ưu tiên/Go-live gate đã có sẵn
// chung cho mọi danh mục; đây chỉ là các trường ĐẶC THÙ còn thiếu, lưu trong cột `details`.
export const EMR_CATEGORY_FIELDS: Record<EmrCategoryCode, EmrField[]> = {
  CHU_KY_SO: [
    { key: "certificate_expiry", label: "Ngày hết hạn chứng thư số", type: "date" },
    { key: "ca_provider", label: "Nhà cung cấp chứng thư số", type: "text" },
  ],
  NHAP_LIEU: [
    { key: "record_count", label: "Số hồ sơ đã nhập", type: "number" },
    { key: "data_source", label: "Nguồn dữ liệu gốc", type: "text" },
  ],
  DAO_TAO: [
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
    { key: "form_code", label: "Mã biểu mẫu", type: "text" },
    { key: "digitized", label: "Tình trạng số hóa", type: "select", options: ["Đã số hóa", "Chưa số hóa"] },
  ],
  LOI: [
    { key: "severity", label: "Mức độ", type: "select", options: ["Thấp", "Trung bình", "Cao", "Nghiêm trọng"] },
  ],
  THIET_BI_CNTT: [
    { key: "asset_tag", label: "Mã tài sản", type: "text" },
    { key: "location", label: "Vị trí lắp đặt", type: "text" },
  ],
};
