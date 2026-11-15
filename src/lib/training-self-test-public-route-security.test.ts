import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// "Nhân viên có thể quét QR để vào trực tiếp làm bài mà ko cần đăng nhập" —
// 1 ngoại lệ CÓ CHỦ Ý với nguyên tắc chung "mọi route trong procedure-
// trainings đều có requireApiPermission" (xem procedure-trainings-security.
// test.ts). Route công khai nằm riêng ở /api/public/training-test/** —
// KHÔNG đụng tới boundary emr.view/emr.manage hay procedure_training.view/
// manage, và middleware.ts đã liệt /api/** là public từ trước (auth được
// enforce theo từng route, không phải ở middleware) nên chỉ cần route
// không gọi requireApiPermission/requireUserContext là đã public đúng ý.
describe("Public training self-test routes (/api/public/training-test/**): cố ý không đăng nhập, nhưng phải chặn đúng chỗ", () => {
  const getRoute = read("src/app/api/public/training-test/[roundId]/route.ts");
  const submitRoute = read("src/app/api/public/training-test/[roundId]/submit/route.ts");

  it("KHÔNG gọi requireApiPermission/requireUserContext (cố ý public) nhưng vẫn dùng createAdminClient (service role, không thêm RLS cho anon)", () => {
    for (const src of [getRoute, submitRoute]) {
      expect(src).not.toContain("requireApiPermission(");
      expect(src).not.toContain("requireUserContext(");
      expect(src).toContain("createAdminClient");
    }
  });

  it("GET không bao giờ select correct_answer — chỉ trả question_text/choices", () => {
    expect(getRoute).toContain('.select("question_no,question_text,choices")');
  });

  it("GET chỉ trả câu hỏi khi is_open_for_submission = true, đóng thì chỉ trả tên đợt (không lộ đề)", () => {
    expect(getRoute).toContain("if (!round.is_open_for_submission)");
    expect(getRoute).toContain("open: false");
  });

  it("POST (nộp bài) chặn khi đợt chưa mở — 403 trước khi chạm vào bất kỳ bảng ghi điểm nào", () => {
    expect(submitRoute).toContain("if (!round.is_open_for_submission)");
    expect(submitRoute).toContain('status: 403 }');
  });

  it("POST chặn nộp trùng theo mã NV đã chuẩn hoá trong cùng round — đúng chính sách đã chốt 'chỉ 1 lần, không làm lại'", () => {
    expect(submitRoute).toContain("normalizeEmployeeCode");
    expect(submitRoute).toContain("existingResult");
    expect(submitRoute).toContain("status: 409");
  });

  it("chấm điểm bằng lib thuần (gradeAnswers/computeScore), không tự so sánh tay trong route", () => {
    expect(submitRoute).toContain('from "@/lib/training-self-test"');
    expect(submitRoute).toContain("gradeAnswers(questions, answers)");
  });

  it("kết quả trả về cho người làm bài KHÔNG có correct_answer (chỉ is_correct), tránh lộ đáp án cho người làm sau", () => {
    const responseBlock = submitRoute.slice(submitRoute.indexOf("return NextResponse.json({\n    ok: true,"));
    expect(responseBlock).not.toContain("correct_answer");
  });
});

describe("middleware.ts: /lam-bai/** là route công khai (trang làm bài, không đăng nhập)", () => {
  it("publicPath bao gồm /lam-bai/", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('path.startsWith("/lam-bai/")');
  });
});

describe("procedure_training_questions: PUT (thay toàn bộ đáp án) giữ lại question_text/choices theo đúng question_no cũ", () => {
  it("không xoá mất nội dung câu hỏi đã soạn riêng khi dán lại danh sách đáp án", () => {
    const route = read("src/app/api/procedure-trainings/[id]/questions/route.ts");
    expect(route).toContain("existingByNo");
    expect(route).toContain("question_text: prior?.question_text ?? null");
    expect(route).toContain("choices: prior?.choices ?? null");
  });
});

describe("PATCH /api/procedure-trainings/[id]/questions/[questionNo]: sửa nội dung công khai 1 câu, VẪN cần đăng nhập + quyền manage", () => {
  it("đòi hỏi procedure_training.manage (khác hẳn 2 route công khai ở trên)", () => {
    const route = read("src/app/api/procedure-trainings/[id]/questions/[questionNo]/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("organization_id", organizationId)');
  });
});

describe("migration 20261130000004_procedure_training_self_test_v1: an toàn-mặc-định, không phá dữ liệu cũ", () => {
  it("is_open_for_submission mặc định false (QR không tự mở)", () => {
    const migration = read("supabase/migrations/20261130000004_procedure_training_self_test_v1.sql");
    expect(migration).toContain("add column if not exists is_open_for_submission boolean not null default false");
  });

  it("question_text/choices nullable — không bắt buộc với câu hỏi cũ chỉ dùng để chấm điểm import, không dùng cho QR", () => {
    const migration = read("supabase/migrations/20261130000004_procedure_training_self_test_v1.sql");
    expect(migration).toContain("add column if not exists question_text text");
    expect(migration).toContain("add column if not exists choices jsonb");
    expect(migration).not.toContain("question_text text not null");
    expect(migration).not.toContain("choices jsonb not null");
  });
});
