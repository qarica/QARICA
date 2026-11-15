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

describe("1 bộ câu hỏi dùng chung cho Pre/Post-test, nhưng mỗi lần làm bài là 1 đợt độc lập tính điểm riêng (đã xác nhận với người dùng)", () => {
  it("chặn nộp trùng chỉ so với CÙNG round_id — không chặn người đã làm Pre-test khi họ làm tiếp Post-test (round_id khác)", () => {
    const submitRoute = read("src/app/api/public/training-test/[roundId]/submit/route.ts");
    expect(submitRoute).toContain('.eq("round_id", round.id)');
  });

  it("câu hỏi lấy theo training_id (dùng chung mọi round của cùng quy trình), điểm lưu riêng theo round_id (unique round_id+attendee_id)", () => {
    const submitRoute = read("src/app/api/public/training-test/[roundId]/submit/route.ts");
    expect(submitRoute).toContain('.eq("training_id", round.training_id)');
    const migration = read("supabase/migrations/20261130000000_procedure_training_rounds_results_v1.sql");
    expect(migration).toContain("unique(round_id, attendee_id)");
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

// Phát hiện thực tế: 1 đợt kiểm tra đã bật "Mở làm bài qua QR" (is_open_
// for_submission=true) từ trước khi có câu hỏi nào — nhân viên quét QR vào
// thấy form trống, không có nội dung để làm. Chặn ngay tại API, không để
// admin lỡ tay bật khi chưa soạn câu hỏi.
describe("PATCH rounds/[roundId]: không cho bật is_open_for_submission khi quy trình chưa có câu hỏi nào", () => {
  it("kiểm tra số câu hỏi (procedure_training_questions) trước khi cho phép mở, 400 nếu bằng 0", () => {
    const route = read("src/app/api/procedure-trainings/[id]/rounds/[roundId]/route.ts");
    expect(route).toContain('.from("procedure_training_questions").select("id", { count: "exact", head: true }).eq("training_id", trainingId)');
    expect(route).toContain('if (!questionCount) return NextResponse.json({ error: "Chưa có câu hỏi nào');
  });

  it("vẫn cho ĐÓNG thoải mái (is_open_for_submission=false) bất kể có câu hỏi hay không — chỉ chặn chiều MỞ", () => {
    const route = read("src/app/api/procedure-trainings/[id]/rounds/[roundId]/route.ts");
    expect(route).toContain("if (wantsOpen) {");
  });
});

describe("UI: nút 'Mở làm bài qua QR' bị disable khi chưa có câu hỏi, giải thích rõ lý do qua title", () => {
  it("RosterTab nhận hasQuestions, disable nút mở khi !hasQuestions", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("disabled={toggleBusyId === r.id || (!r.is_open_for_submission && !hasQuestions)}");
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
