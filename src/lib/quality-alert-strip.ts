export type AlertStripTone = "red" | "amber" | "purple" | "blue";
export type AlertStripItem = {
  tone: AlertStripTone;
  icon: string;
  title: string;
  sub: string;
  when?: string;
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
  const { capaOverdueCount, outTargetIndicatorCount, auditNearDueCount, auditNearDueFirstEndDate, investigatingCount, docReviewOverdueCount, today } = input;
  const items: (AlertStripItem | null)[] = [
    capaOverdueCount > 0 ? { tone: "red", icon: "clock", title: `${capaOverdueCount} CAPA đã quá hạn`, sub: "Cần phân công/đôn đốc thực hiện", when: "Hôm nay", href: "/capa" } : null,
    outTargetIndicatorCount > 0 ? { tone: "amber", icon: "chart-no-axes-column-increasing", title: `${outTargetIndicatorCount} chỉ số vượt ngưỡng`, sub: "Ngoài mục tiêu trong kỳ đo gần nhất", when: today, href: "/indicators" } : null,
    auditNearDueCount > 0 ? { tone: "purple", icon: "calendar-days", title: `${auditNearDueCount} Audit sắp đến hạn`, sub: auditNearDueFirstEndDate ? `Dự kiến: ${auditNearDueFirstEndDate}` : "", when: today, href: "/audits" } : null,
    investigatingCount > 0 ? { tone: "blue", icon: "file-text", title: `${investigatingCount} sự cố đang điều tra RCA`, sub: "Cần theo dõi tiến độ phân tích nguyên nhân", when: today, href: "/incidents" } : null,
    docReviewOverdueCount > 0 ? { tone: "red", icon: "file-text", title: `${docReviewOverdueCount} văn bản cần xem xét lại`, sub: "Đã quá hạn rà soát định kỳ", when: today, href: "/document-publications" } : null,
  ];
  return items.filter((x): x is AlertStripItem => x !== null);
}
