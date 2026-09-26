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
