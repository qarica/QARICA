import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Tiếp tục áp dụng lớp lỗi "nguồn dữ liệu bị bỏ sót khỏi phạm vi lọc tổ
// chức" (đã phát hiện ở Dashboard: risks/audits) sang GET /api/domain-records
// — route cấp dữ liệu cho form "Tạo hồ sơ" (danh sách bộ tiêu chí cho
// ASSESSMENT/EXTERNAL_ASSESSMENT, danh sách chỉ số được phân công cho
// INDICATOR_MEASUREMENT). Cả 2 nhánh dùng admin (service-role, bỏ qua RLS)
// nhưng KHÔNG tự lọc theo organization_id của người gọi, trong khi
// criteria_sets và indicator_definitions đều có policy đọc theo tổ chức
// (organization_id is null [global] hoặc = tổ chức hiện tại) — xem
// supabase/migrations/20260923074500_tenant_read_boundary_def_children_v1.sql.
// Hậu quả: dropdown "Tạo đợt tự đánh giá" / "Tạo kỳ đo chỉ số" từng hiện cả
// bộ tiêu chí riêng và chỉ số/phân công của MỌI bệnh viện khác dùng chung
// QARICA, không chỉ bộ tiêu chí global hoặc của tổ chức mình.
//
// fmea_scoring_model_versions (nhánh FMEA ngay bên dưới) CHỦ Ý không lọc —
// bảng này nằm trong allowed_global của
// supabase/verification/TENANT_READ_BOUNDARY_POSTCHECK_V1.sql (master data
// toàn cục, không theo tổ chức) — nên không phải lỗi, không cần sửa.
describe("GET /api/domain-records — criteria_sets và indicator_definitions không còn lộ dữ liệu chéo tổ chức", () => {
  const source = readFileSync("src/app/api/domain-records/route.ts", "utf8");

  it("criteria_sets lọc global-hoặc-tổ-chức-hiện-tại giống quality-domains/route.ts", () => {
    expect(source).toContain(
      'admin.from("criteria_sets").select("id,code,name,is_active,organization_id").in("id",setIds).eq("is_active",true).or(`organization_id.is.null,organization_id.eq.${caller.organization_id}`)',
    );
  });

  it("indicator_definitions lọc theo organization_id của người gọi, và indicatorAssignments loại bỏ phân công không khớp (không rơi về nhãn generic)", () => {
    expect(source).toContain(
      'admin.from("indicator_definitions").select("id,code,name").in("id",defIds).eq("organization_id",caller.organization_id)',
    );
    expect(source).toContain(
      "indicatorAssignments=(assign??[]).filter((a:any)=>{const v=vm.get(a.indicator_version_id);return !!v&&dm.has(v.indicator_definition_id);})",
    );
  });

  it("fmea_scoring_model_versions vẫn không lọc tổ chức (đúng — master data toàn cục theo thiết kế)", () => {
    expect(source).toContain('admin.from("fmea_scoring_model_versions").select("id,name,method,version_no").eq("status","PUBLISHED")');
  });
});
