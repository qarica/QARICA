import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lỗi lộ dữ liệu chéo tổ chức NGHIÊM TRỌNG NHẤT đã phát hiện trong phiên rà
// soát toàn bộ phần mềm: syncQualityAttentionForUser (chạy cho MỌI user có
// chỉ đạo/báo cáo/rủi ro/chỉ số/CAPA/feedback/tiếp đoàn/finding cần chú ý,
// cả qua notification-bell polling và cron /api/cron/sync-notifications quét
// TẤT CẢ user mọi tổ chức) từng lấy `records` KHÔNG lọc organization_id.
//
// Với mọi nhánh có quyền "manage" (canManageDirectives, canVerifyIndicators,
// canManageCapa, canManageFeedback, canManageInspections, canManageFindings),
// code CHỦ Ý bỏ qua hẳn kiểm tra mine() — vì một Trưởng phòng QLCL cần thấy
// TẤT CẢ chỉ đạo/CAPA/feedback/tiếp đoàn của tổ chức mình, không chỉ của
// riêng họ. Nhưng vì `records` không lọc tổ chức, "tất cả" đó thành "tất cả
// của MỌI bệnh viện dùng chung QARICA" — bất kỳ ai có 1 trong các quyền manage
// trên sẽ nhận thông báo cá nhân chứa record_code, tiêu đề, hạn, mức độ, tên
// cơ quan/đoàn kiểm tra... của CÁC BỆNH VIỆN KHÁC, mỗi lần notification-bell
// poll hoặc cron quét.
describe("syncQualityAttentionForUser — không còn lộ chỉ đạo/báo cáo/rủi ro/CAPA/feedback/tiếp đoàn/finding chéo tổ chức", () => {
  const source = readFileSync("src/lib/notification-sync.ts", "utf8");

  it("profile lấy thêm organization_id (không chỉ primary_department_id) và dừng sớm nếu thiếu", () => {
    expect(source).toContain('admin.from("profiles").select("organization_id,primary_department_id").eq("user_id", userId).maybeSingle()');
    expect(source).toContain("if (!profile?.organization_id) return { created: 0, candidates: 0 };");
  });

  it("nguồn records duy nhất lọc theo organization_id của chính user — mọi nhánh manage phía dưới tự động đúng phạm vi", () => {
    expect(source).toContain(
      'admin.from("records").select("id,record_type,record_code,title,owner_user_id,owner_department_id").eq("organization_id", profile.organization_id).eq("work_year", year).eq("lifecycle_status", "ACTIVE")',
    );
  });
});
