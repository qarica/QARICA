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
    expect(route).toContain("Mã nhân viên này đã đăng ký buổi/đợt này rồi.");
  });

  // "mỗi đợt đào tạo có nhiều buổi/ngày khác nhau, cần đăng ký theo từng
  // buổi" — tái dùng procedure_training_rounds làm "buổi" để chọn lúc đăng
  // ký (không tạo bảng/khái niệm mới), bắt buộc chọn khi đợt đào tạo đã có
  // buổi nào, bỏ qua khi chưa có buổi nào (không ép tạo "đợt kiểm tra"
  // trước mới mở đăng ký được).
  it("đăng ký bắt buộc chọn buổi/đợt khi đợt đào tạo đã có buổi — chặn trùng theo (mã NV, buổi), không phải theo cả đợt đào tạo", () => {
    const migration = read("supabase/migrations/20261130000008_procedure_training_registration_round_v1.sql");
    expect(migration).toContain("add column if not exists round_id uuid references public.procedure_training_rounds(id) on delete cascade");

    const route = read("src/app/api/public/training-registration/[trainingId]/route.ts");
    expect(route).toContain('"procedure_training_rounds"');
    expect(route).toContain("Chưa chọn buổi/đợt đào tạo.");
    expect(route).toContain("Buổi/đợt đào tạo không hợp lệ.");
    expect(route).toContain('query.eq("round_id", validatedRoundId) : query.is("round_id", null)');

    const page = read("src/app/dang-ky-dao-tao/[trainingId]/page.tsx");
    expect(page).toContain("state.rounds.length ? (");
    expect(page).toContain("round_id: roundId");
    expect(page).toContain("state.rounds.length > 0 && !roundId");
  });

  it("UI tab Đăng ký hiện cột Buổi/đợt cho từng người đã đăng ký", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("<th>Buổi/đợt</th>");
    expect(client).toContain("round?.round_label || \"—\"");
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

  // "nếu chỉ làm pre ko làm post coi như ko đạt học lại" — Đạt/Không đạt
  // đánh giá theo ĐỢT CUỐI CÙNG đã tạo (sort_order lớn nhất), không phải
  // đợt gần nhất người đó TÌNH CỜ có điểm — chưa làm đợt cuối (dù đã có
  // điểm ở đợt trước, vd Pre-test) vẫn tính "fail", không phải "none"
  // trung lập. Chỉ "none" khi chưa làm bài ở bất kỳ đợt nào.
  it("Đạt/Không đạt xét theo đợt kiểm tra CUỐI CÙNG đã tạo — chưa làm đợt cuối (dù đã có điểm Pre) tính là KHÔNG ĐẠT, không phải trung lập", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function computePassStatus(myResults: ResultRow[], rounds: Round[], passThreshold: number | null, attended: boolean)");
    expect(client).toContain("const hasAnyScore = myResults.some((r) => r.score != null);");
    expect(client).toContain('if (!hasAnyScore) return "none";');
    expect(client).toContain("const finalRound = [...rounds].sort((a, b) => b.sort_order - a.sort_order");
    expect(client).toContain('if (!finalResult || !attended) return "fail";');
  });

  // Người dùng mô tả quy trình thật: "Post-test là điều kiện bắt buộc... hệ
  // thống chỉ trích xuất điểm Post-test để xét đạt... yêu cầu phải có đủ dữ
  // liệu điểm danh mới công nhận kết quả Post-test" — Đạt đòi thêm attended,
  // không chỉ điểm.
  it("Đạt bắt buộc đã điểm danh (attended=true) — có điểm Post-test đạt ngưỡng nhưng chưa điểm danh vẫn tính KHÔNG ĐẠT", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("computePassStatus(myResults, rounds, passThreshold, a.attended)");
  });

  // "điểm trung bình theo đơn vị chỉ lấy điểm post test, hiện tại app đang
  // lấy các lần ko phân biệt" — groupBy (dùng cho cả theo đơn vị và theo
  // chức danh) phải lọc chỉ lấy điểm ở ĐỢT CUỐI CÙNG (lastRound), không gộp
  // Pre-test lẫn Post-test vào chung 1 điểm TB.
  it("Điểm trung bình theo đơn vị/chức danh chỉ lấy điểm đợt kiểm tra cuối cùng (Post-test), không gộp Pre-test", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("if (!lastRound) return [];");
    expect(client).toContain("if (res.score == null || res.round_id !== lastRound.id) continue;");
    expect(client).toContain("Chỉ tính điểm {lastRound ? lastRound.round_label : \"đợt kiểm tra cuối cùng\"} (Post-test) — không gộp Pre-test.");
  });

  it("UI tab Đăng ký: hiện QR, danh sách đăng ký đối chiếu đã/chưa tham gia, và cảnh báo khoa/phòng còn thiếu người đăng ký (chỉ khi đã khai staff_count)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("Mở đăng ký qua QR");
    expect(client).toContain("Đăng ký nhưng chưa tham gia");
    expect(client).toContain(".filter((d) => d.staff_count != null)");
    expect(client).toContain("Khoa/phòng còn thiếu người đăng ký:");
  });
});
