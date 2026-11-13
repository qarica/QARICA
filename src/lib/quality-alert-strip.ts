export type AlertStripTone = "red" | "amber" | "purple" | "blue";
export type AlertStripItem = {
  tone: AlertStripTone;
  icon: string;
  // Nhãn mức độ nhỏ phía trên tiêu đề (vd "Khẩn cấp · Quá hạn"), đúng vị trí
  // "Khẩn cấp-ngay"/"Khẩn cấp-hôm nay" trong ảnh tham khảo Oryvia.
  eyebrow: string;
  title: string;
  sub: string;
  // Link hành động góc phải (vd "Xem CAPA"), đúng vị trí "Mở sơ đồ giường >"
  // trong ảnh tham khảo — thay cho field `when` (ngày tháng) cũ không có
  // trong tham khảo.
  actionText: string;
  href: string;
};

/**
 * Gộp các dấu hiệu "cần chú ý" cấp toàn tổ chức thành danh sách cho
 * AlertStrip — promoted nguyên văn từ logic đã có sẵn trong
 * src/app/(app)/dashboard/page.tsx (mảng `alerts` cũ), chỉ đổi từ hard-code
 * inline sang hàm thuần có thể test độc lập. KHÔNG tự truy vấn gì — Dashboard
 * vẫn tính các con số này như cũ, chỉ truyền qua hàm này thay vì build mảng
 * trực tiếp trong JSX.
 */
export function buildQualityAlertItems(input: {
  capaOverdueCount: number;
  outTargetIndicatorCount: number;
  auditNearDueCount: number;
  auditNearDueFirstEndDate?: string | null;
  investigatingCount: number;
  docReviewOverdueCount: number;
  today: string;
}): AlertStripItem[] {
  const { capaOverdueCount, outTargetIndicatorCount, auditNearDueCount, auditNearDueFirstEndDate, investigatingCount, docReviewOverdueCount } = input;
  const items: (AlertStripItem | null)[] = [
    capaOverdueCount > 0 ? { tone: "red", icon: "refresh-cw", eyebrow: "Khẩn cấp · Quá hạn", title: `${capaOverdueCount} CAPA đã quá hạn`, sub: "Cần phân công/đôn đốc thực hiện", actionText: "Xem CAPA", href: "/capa" } : null,
    outTargetIndicatorCount > 0 ? { tone: "amber", icon: "chart-no-axes-column-increasing", eyebrow: "Cần chú ý · Ngoài mục tiêu", title: `${outTargetIndicatorCount} chỉ số vượt ngưỡng`, sub: "Ngoài mục tiêu trong kỳ đo gần nhất", actionText: "Xem chỉ số", href: "/indicators" } : null,
    auditNearDueCount > 0 ? { tone: "purple", icon: "calendar-days", eyebrow: "Sắp đến hạn", title: `${auditNearDueCount} Audit sắp đến hạn`, sub: auditNearDueFirstEndDate ? `Dự kiến: ${auditNearDueFirstEndDate}` : "", actionText: "Xem Audit", href: "/audits" } : null,
    investigatingCount > 0 ? { tone: "blue", icon: "file-text", eyebrow: "Đang xử lý · RCA", title: `${investigatingCount} sự cố đang điều tra RCA`, sub: "Cần theo dõi tiến độ phân tích nguyên nhân", actionText: "Xem sự cố", href: "/incidents" } : null,
    docReviewOverdueCount > 0 ? { tone: "red", icon: "file-text", eyebrow: "Khẩn cấp · Quá hạn", title: `${docReviewOverdueCount} văn bản cần xem xét lại`, sub: "Đã quá hạn rà soát định kỳ", actionText: "Xem văn bản", href: "/document-publications" } : null,
  ];
  return items.filter((x): x is AlertStripItem => x !== null);
}
