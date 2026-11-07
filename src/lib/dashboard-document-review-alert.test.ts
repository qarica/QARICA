import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế: "Dashboard mình thiếu văn bản cần xem xét lại" — Kiểm
// soát tài liệu (document_publications) đã có review_date + badge "Quá hạn
// rà soát" ngay trong trang riêng (document-publications-client.tsx), nhưng
// chưa từng xuất hiện ở Dashboard tổng (Cảnh báo & công việc cần chú ý)
// như CAPA quá hạn/chỉ số vượt ngưỡng/Audit sắp đến hạn ngay bên cạnh —
// đồng thời "Kiểm soát tài liệu" cũng thiếu hẳn trong "Truy cập nhanh".
describe("Dashboard — thêm cảnh báo 'văn bản cần xem xét lại' (document_publications quá hạn rà soát)", () => {
  const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");

  it("truy vấn document_publications PUBLISHED qua supabase (client RLS đúng tổ chức), không qua recordIdList vì không gắn work_year", () => {
    expect(dashboard).toContain('supabase.from("document_publications").select("id,review_date,drafting_department_id").eq("stage","PUBLISHED")');
  });

  it("đếm quá hạn rà soát đúng luật ngưỡng (review_date < today), tôn trọng bộ lọc khoa/phòng đã chọn trên Dashboard giống các nguồn khác", () => {
    expect(dashboard).toContain(
      "const docReviewOverdue = ((docPublicationsRes.data ?? []) as any[]).filter((d: any) => d.review_date && d.review_date < today && (!selectedDept || d.drafting_department_id === selectedDept)).length;",
    );
  });

  it("thêm vào mảng alerts (Cảnh báo & công việc cần chú ý) khi có văn bản quá hạn, trỏ đúng /document-publications", () => {
    expect(dashboard).toContain(
      'docReviewOverdue > 0 ? { icon: "file-text", tone: "red", title: `${docReviewOverdue} văn bản cần xem xét lại`, sub: "Đã quá hạn rà soát định kỳ", when: today, href: "/document-publications" } : null,',
    );
  });

  it("docPublicationsRes được gộp vào firstError để không nuốt lỗi truy vấn", () => {
    expect(dashboard).toContain("const firstError = [recordsRes, docPublicationsRes, incidentsAllRes,");
  });

  it("'Kiểm soát tài liệu' có mặt trong Truy cập nhanh (trước đây thiếu hẳn, không có đường vào nhanh từ Dashboard)", () => {
    expect(dashboard).toContain('<Link className="quick-link" href="/document-publications">');
  });
});
