import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Tự rà lại sau phản hồi "rà chưa sát" (lỗi KPI "Việc của tôi" bỏ sót note
// cá nhân) — áp cùng lớp lỗi "nguồn dữ liệu bị bỏ sót khỏi phạm vi lọc" cho
// Dashboard. Phát hiện 2 lỗi trong cùng Promise.all: risks và audits là 2
// nguồn DUY NHẤT không lọc theo recordIdList (năm công tác + khoa/phòng đã
// chọn trên Dashboard), khác hẳn incidents/capas/indicators ngay bên cạnh —
// "Rủi ro mức cao" và "Audit đang thực hiện" luôn hiện số liệu CỦA MỌI NĂM,
// không đổi theo bộ lọc năm/khoa phòng trên trang.
//
// Nghiêm trọng hơn: audits còn dùng admin (service-role, bỏ qua RLS) dù
// bảng audits đã có policy tổ chức riêng (qlcl_authenticated_select ...
// record_in_current_organization) — không lọc gì thêm nghĩa là gộp CẢ audit
// của mọi bệnh viện khác dùng chung QARICA vào KPI của bệnh viện hiện tại.
describe("Dashboard — risks và audits không còn bỏ sót bộ lọc năm/khoa phòng, audits không còn lộ dữ liệu chéo tổ chức", () => {
  const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");

  it("risks lọc theo recordIdList giống incidents/capas/indicators ngay bên cạnh", () => {
    expect(dashboard).toContain('supabase.from("risks").select("id,record_id,workflow_status,next_review_date").in("record_id",recordIdList)');
  });

  it("audits dùng supabase (client RLS đúng tổ chức), không còn dùng admin (service-role bỏ qua RLS), và lọc theo recordIdList", () => {
    expect(dashboard).toContain('supabase.from("audits").select("id,record_id,workflow_status,start_date,end_date,closed_at,report_finalized_at").in("record_id",recordIdList)');
    expect(dashboard).not.toContain('admin.from("audits")');
  });
});
