import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Rà write-side RLS (bổ sung cho các vòng rà read-side/admin-leak trước):
// fmea_mode_assessments (điểm S/O/D/RPN baseline/residual của từng failure
// mode) được tạo ở 20260917_fmea_residual_reassessment_v1.sql nhưng CHƯA
// TỪNG enable row level security, và không nằm trong danh sách "revoke
// select ... from anon" ở 20260923075000_tenant_read_boundary_workflow_links_v1.sql
// dù 2 bảng cha trực tiếp cùng lô (fmea_process_steps, fmea_failure_modes)
// đã được xử lý đúng ngay trong migration đó. App chỉ đọc/ghi bảng này qua
// admin client (service-role, luôn bỏ qua RLS) nên bật RLS không ảnh hưởng
// gì đến hoạt động hiện tại — chỉ đóng lỗ hổng nếu RLS thực sự đang tắt
// trên DB sống (cho phép bất kỳ user đăng nhập của BẤT KỲ bệnh viện nào gọi
// trực tiếp Supabase REST API đọc/ghi điểm rủi ro an toàn người bệnh của tổ
// chức khác).
describe("fmea_mode_assessments — bật RLS và chặn truy cập chéo tổ chức qua Supabase REST trực tiếp", () => {
  const migration = read("supabase/migrations/20261106_fmea_mode_assessments_rls_v1.sql");

  it("enable row level security và tạo policy select theo đúng chuỗi join đã dùng cho fmea_failure_modes", () => {
    expect(migration).toContain("alter table public.fmea_mode_assessments enable row level security;");
    expect(migration).toContain("create policy qlcl_authenticated_select on public.fmea_mode_assessments for select to authenticated");
    expect(migration).toContain("fm.id = fmea_mode_assessments.failure_mode_id");
    expect(migration).toContain("r.organization_id = private.current_organization_id()");
  });

  it("revoke select từ anon, khớp quy ước đã dùng cho fmea_process_steps/fmea_failure_modes", () => {
    expect(migration).toContain("revoke select on public.fmea_mode_assessments from anon;");
  });

  it("xác nhận app chỉ đọc/ghi bảng này qua admin client (service-role) — bật RLS không ảnh hưởng chức năng hiện có", () => {
    const route = read("src/app/api/fmea/[id]/assessments/route.ts");
    expect(route).toContain('import { createAdminClient } from "@/lib/supabase/admin";');
    expect(route).toContain(".from(\"fmea_mode_assessments\")");
  });
});
