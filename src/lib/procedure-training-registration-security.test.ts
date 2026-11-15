import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// "Cần bổ sung chức năng quét QR hoặc link đăng ký để đăng ký slot trước...
// vừa có thể kiểm soát ai đăng ký nhưng không đi học, ai không đăng ký theo
// số lượng nhân viên của khoa phòng. Cần có ngưỡng chấm điểm đạt hay không
// đạt theo từng khoa phòng để yêu cầu học lại theo từng nhân viên." Quyết
// định đã chốt: đăng ký từng người tự qua QR (không phải khoa khai số
// lượng), 1 ngưỡng đạt/không đạt DUY NHẤT cho cả đợt đào tạo (không tách
// riêng theo khoa/phòng), không đạt chỉ đánh dấu + liệt kê (không tự tạo
// đợt "học lại"), và số nhân viên/khoa lấy từ field mới ở danh mục khoa/
// phòng dùng chung (không nhập riêng từng đợt đào tạo).
describe("Procedure training registration (QR) + pass/fail threshold", () => {
  it("migration thêm departments.staff_count, procedure_trainings.pass_threshold/is_open_for_registration, và bảng registrations với RLS select — không policy anon (route công khai dùng service role)", () => {
    const migration = read("supabase/migrations/20261130000007_procedure_training_registration_pass_threshold_v1.sql");
    expect(migration).toContain("alter table public.departments");
    expect(migration).toContain("add column if not exists staff_count integer");
    expect(migration).toContain("add column if not exists pass_threshold numeric");
    expect(migration).toContain("add column if not exists is_open_for_registration boolean not null default false");
    expect(migration).toContain("create table if not exists public.procedure_training_registrations");
    expect(migration).toContain("references public.procedure_trainings(id) on delete cascade");
    expect(migration).toContain("for select to authenticated");
    expect(migration).not.toContain("to anon");
  });

  it("route công khai GET/POST /api/public/training-registration/[trainingId]: không requireApiPermission, chỉ nhận đăng ký khi is_open_for_registration, chặn trùng theo mã NV đã chuẩn hoá", () => {
    const route = read("src/app/api/public/training-registration/[trainingId]/route.ts");
    expect(route).not.toContain("requireApiPermission");
    expect(route).toContain("createAdminClient");
    expect(route).toContain("if (!training.is_open_for_registration)");
    expect(route).toContain("normalizeEmployeeCode");
    expect(route).toContain("Mã nhân viên này đã đăng ký đợt đào tạo này rồi.");
  });

  it("trang công khai /dang-ky-dao-tao/[trainingId] tồn tại và gọi đúng route đăng ký", () => {
    const page = read("src/app/dang-ky-dao-tao/[trainingId]/page.tsx");
    expect(page).toContain('"use client"');
    expect(page).toContain("/api/public/training-registration/");
  });

  it("route xoá đăng ký (admin) dùng procedure_training.manage + lọc theo organization_id", () => {
    const route = read("src/app/api/procedure-trainings/[id]/registrations/[registrationId]/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("organization_id", organizationId)');
    expect(route).toContain("export async function DELETE(");
  });

  it("PATCH /api/procedure-trainings/[id] cho sửa pass_threshold và is_open_for_registration cùng các field đã có (không phải route riêng)", () => {
    const route = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(route).toContain('"pass_threshold"');
    expect(route).toContain('"is_open_for_registration"');
    expect(route).toContain("pass_threshold,is_open_for_registration");
  });

  it("POST và PATCH /api/admin/departments đều validate + lưu staff_count (số nguyên không âm)", () => {
    const postRoute = read("src/app/api/admin/departments/route.ts");
    const patchRoute = read("src/app/api/admin/departments/[id]/route.ts");
    for (const route of [postRoute, patchRoute]) {
      expect(route).toContain("Số nhân viên không hợp lệ.");
      expect(route).toContain("staff_count:staffCount");
    }
  });

  // "1 ngưỡng chung cho cả đợt đào tạo" — không lưu cột trạng thái đạt/
  // không đạt (tránh 2 nguồn sự thật), tính lại từ điểm đợt kiểm tra gần
  // nhất mỗi lần hiển thị.
  it("UI: Đạt/Không đạt tính thuần từ pass_threshold + điểm đợt kiểm tra gần nhất, không lưu cột trạng thái mới", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function computePassStatus(");
    expect(client).toContain("function RegistrationTab(");
    expect(client).toContain("Không đạt — cần học lại");
    expect(client).toContain('training.pass_threshold != null ? String(training.pass_threshold) : ""');
  });

  it("UI tab Đăng ký: hiện QR, danh sách đăng ký đối chiếu đã/chưa tham gia, và cảnh báo khoa/phòng còn thiếu người đăng ký (chỉ khi đã khai staff_count)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("Mở đăng ký qua QR");
    expect(client).toContain("Đăng ký nhưng chưa tham gia");
    expect(client).toContain(".filter((d) => d.staff_count != null)");
    expect(client).toContain("Khoa/phòng còn thiếu người đăng ký:");
  });
});
