import { EMR_CATEGORIES } from "@/lib/emr-categories";

// Mô tả 1 dòng cho từng module, dùng riêng cho trang "Danh mục module"
// (/modules) — không đụng vào navigation.ts (file đó bị khoá rất chặt bởi
// navigation-v2.test.ts, so sánh nguyên văn từng object literal). Khoá theo
// NavItem.label (ổn định, không đổi theo workspaceLandingHref per-user) thay
// vì href. Mô tả của 9 danh mục EMR tái dùng thẳng EMR_CATEGORIES.description
// có sẵn — một nguồn duy nhất, không chép tay lệch sau này.
export const MODULE_DESCRIPTIONS: Record<string, string> = {
  "Tổng quan QLCL": "KPI, biểu đồ chỉ số chất lượng toàn viện.",
  "Kế hoạch & Điều hành": "Kế hoạch QLCL theo năm, phân công nhiệm vụ.",
  "Đo lường & Giám sát": "Chỉ số chất lượng, đo lường định kỳ.",
  "Đánh giá & Kiểm tra": "Checklist đánh giá, chấm điểm tiêu chí.",
  "Sự cố & Phản ánh": "Ghi nhận, phân tích RCA sự cố y khoa.",
  "Rủi ro & FMEA": "Sổ rủi ro, phân tích FMEA.",
  "Khắc phục & CAPA": "Hành động khắc phục - phòng ngừa, Finding.",
  "Cải tiến chất lượng": "Đề xuất và dự án cải tiến chất lượng.",
  "Kho minh chứng": "Lưu trữ minh chứng QLCL tập trung.",
  "Báo cáo & Phân tích QLCL": "Báo cáo tổng hợp, phân tích đa chiều.",
  "Tổng quan EMR": "Tiến độ triển khai bệnh án điện tử.",
  "Timeline": "Dòng thời gian triển khai EMR.",
  "AUDIT HSBA": "Audit hồ sơ bệnh án nội trú.",
  "Theo dõi hạn đăng ký hành nghề": "Hạn đăng ký hành nghề trên cổng SYT/BHYT.",
  "Hồ sơ năng lực hành nghề": "GPHN/CCHN, văn bằng, chứng chỉ, phạm vi hành nghề.",
  "QUẢN LÝ CÔNG VĂN": "Công văn đến, công văn đi.",
  "Kiểm soát tài liệu": "Ban hành, kiểm soát văn bản quy trình.",
  "Đào tạo quy trình": "Kế hoạch đào tạo, khóa học, cấp chứng nhận.",
  "MUA SẮM & SỬA CHỮA": "Yêu cầu mua sắm, sửa chữa thiết bị.",
  "SỔ QUẢN LÝ TTBYT": "Sổ tài sản trang thiết bị y tế.",
  "CẤU HÌNH HỆ THỐNG": "Người dùng, vai trò, danh mục, nhật ký hệ thống.",
  ...Object.fromEntries(EMR_CATEGORIES.map((c) => [c.label, c.description])),
};

// Luân phiên màu badge theo nhóm — dùng lại đúng các token màu trạng thái đã
// có (--brand/--info/--success/--warning), không bịa màu mới.
export const GROUP_TONES = ["brand", "info", "success", "warning"] as const;

// Yêu cầu tường minh "màu như TA" (tham khảo portal Tâm Anh Hospital): mỗi ô
// module có icon tô màu riêng, không đồng loạt 1 màu xám như trước — luân
// phiên qua cả 5 token màu đã có (thêm "danger" so với GROUP_TONES) để tạo
// hiệu ứng lưới nhiều màu giống bản tham khảo, vẫn dùng đúng token sẵn có.
export const TILE_TONES = ["brand", "info", "success", "warning", "danger"] as const;
