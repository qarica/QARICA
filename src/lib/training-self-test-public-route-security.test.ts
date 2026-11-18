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

  // Phát hiện từ dữ liệu khảo sát giấy cũ anh gửi: "Khoa Ung Bướu" vs "Khoa
  // ubg bướu", tên bệnh viện viết 3 kiểu khác nhau — Đơn vị công tác phải
  // CHỌN từ danh sách khoa/phòng thật, không tự gõ, giống hệt cách đã làm ở
  // /api/public/document-ack.
  it("GET trả kèm danh sách khoa/phòng thật của tổ chức để chọn Đơn vị công tác", () => {
    expect(getRoute).toContain('.from("departments").select("id,name").eq("organization_id", round.organization_id).eq("is_active", true)');
  });

  it("POST bắt buộc department_id + job_title, validate department_id thuộc đúng tổ chức của đợt", () => {
    expect(submitRoute).toContain('if (!departmentId) return NextResponse.json({ error: "Chưa chọn đơn vị công tác." }');
    expect(submitRoute).toContain('if (!jobTitle) return NextResponse.json({ error: "Chưa chọn chức danh chuyên môn." }');
    expect(submitRoute).toContain('.from("departments").select("id,name").eq("id", departmentId).eq("organization_id", round.organization_id)');
  });

  it("lưu tên khoa/phòng (department.name) + job_title vào procedure_training_attendees khi tạo mới", () => {
    const insertBlock = submitRoute.slice(submitRoute.indexOf(".insert({"));
    expect(insertBlock).toContain("department: department.name");
    expect(insertBlock).toContain("job_title: jobTitle");
  });

  // Báo cáo thực tế: "Mã nhân viên không bắt buộc điền" — bỏ validate bắt
  // buộc ở cả UI (bỏ `required`/đổi nhãn "(tùy chọn)") lẫn route nộp bài;
  // khi bỏ trống thì KHÔNG so khớp/chặn nộp trùng được (không có gì để so),
  // mỗi lần nộp tạo attendee mới — cùng quy ước route đăng ký đào tạo đã
  // dùng khi bỏ trống mã NV.
  it("Mã nhân viên không còn bắt buộc — UI bỏ required, route không chặn khi bỏ trống, và không chạy so khớp trùng khi đó", () => {
    expect(submitRoute).not.toContain('if (!employeeCodeRaw) return NextResponse.json({ error: "Chưa nhập mã nhân viên." }');
    expect(submitRoute).toContain("const normalizedCode = employeeCodeRaw ? normalizeEmployeeCode(employeeCodeRaw) : null;");
    expect(submitRoute).toContain("employee_code: employeeCodeRaw || null,");

    // Chỉ bỏ required ở FORM NỘP BÀI — form "Xem lại bài đã làm" (tra cứu lại
    // bằng mã NV) vẫn bắt buộc, vì không có gì để tra cứu nếu bỏ trống.
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page).toContain("Mã nhân viên (tùy chọn)");
    expect(page).toContain('<input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="NV0012" />');
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

  // "Xem lại bài làm đủ 4 đáp án chứ ko chỉ 1 đáp án" — màn hình kết quả
  // (ngay sau khi nộp) phải trả kèm cả bộ lựa chọn (choices) để UI vẽ lại
  // đúng dạng trắc nghiệm, không chỉ 1 dòng text đáp án đã chọn.
  it("kết quả trả kèm choices của từng câu (không chỉ answer_text) để UI hiện đủ các lựa chọn, không chỉ đáp án đã chọn", () => {
    const responseBlock = submitRoute.slice(submitRoute.indexOf("return NextResponse.json({\n    ok: true,"));
    expect(responseBlock).toContain("choices,");
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

// "Nếu cần xem chi tiết từng bài làm từng đáp án nhân viên chọn cần có để
// cho nhân viên xem vì họ thắc mắc" — nhân viên không có tài khoản nên
// không đăng nhập lại tra cứu được, chỉ tự nhận diện lại bằng mã NV. Route
// riêng (lookup), KHÔNG yêu cầu round đang mở (khác submit) vì thường tra
// lại SAU khi đợt đã đóng.
describe("POST /api/public/training-test/[roundId]/lookup: xem lại bài đã nộp (không đăng nhập), hoạt động kể cả khi round đã đóng", () => {
  const lookupRoute = read("src/app/api/public/training-test/[roundId]/lookup/route.ts");

  it("KHÔNG gọi requireApiPermission/requireUserContext, dùng createAdminClient", () => {
    expect(lookupRoute).not.toContain("requireApiPermission(");
    expect(lookupRoute).not.toContain("requireUserContext(");
    expect(lookupRoute).toContain("createAdminClient");
  });

  it("KHÔNG kiểm tra is_open_for_submission trong code (không có if nào chặn theo cờ đó) — tra cứu được cả khi round đã đóng (khác route submit)", () => {
    expect(lookupRoute).not.toContain("round.is_open_for_submission");
  });

  it("nhận diện lại bằng mã NV đã chuẩn hoá (normalizeEmployeeCode), không yêu cầu đăng nhập", () => {
    expect(lookupRoute).toContain('from "@/lib/training-self-test"');
    expect(lookupRoute).toContain("normalizeEmployeeCode(employeeCodeRaw)");
  });

  it("procedure_training_questions select KHÔNG lấy cột đáp án đúng — chỉ question_text + choices (để hiện đủ các lựa chọn), tránh lộ đáp án qua lần tra cứu lại", () => {
    expect(lookupRoute).toContain('.select("question_no,question_text,choices")');
  });

  // "Xem lại bài làm đủ 4 đáp án chứ ko chỉ 1 đáp án"
  it("trả kèm choices của từng câu, không chỉ answer_text đã chọn", () => {
    expect(lookupRoute).toContain("choices,");
  });

  it("trả kèm thời gian nộp bài (confirmed_at/created_at) làm bằng chứng khi có thắc mắc", () => {
    expect(lookupRoute).toContain('.select("id,score,created_at")');
    expect(lookupRoute).toContain("submittedAt: result.created_at");
  });
});

describe("UI /lam-bai: màn hình kết quả (ngay sau khi nộp VÀ tra cứu lại) hiện đủ câu hỏi + đáp án đã chọn, không chỉ Đúng/Sai trống trơn", () => {
  it("hiện question_text và answer_text cho từng câu", () => {
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page).toContain("Bạn chọn: {r.answer_text");
    expect(page).toContain("Đã chọn: {r.answer_text");
  });

  it("có lối vào 'Xem lại kết quả' từ cả màn hình đã đóng lẫn form đang mở (chưa nộp)", () => {
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page.split("Đã làm bài đợt này rồi? Xem lại kết quả →").length - 1).toBe(2);
  });

  // "Xem lại bài làm đủ 4 đáp án chứ ko chỉ 1 đáp án" — câu trắc nghiệm phải
  // hiện đủ bộ lựa chọn (giống lúc làm bài), không chỉ 1 dòng text đáp án đã
  // chọn. Đáp án đã chọn được đánh dấu Đúng/Sai NGAY TRÊN lựa chọn đó, các
  // lựa chọn còn lại không đánh dấu gì (không lộ đáp án đúng).
  it("câu có choices hiện đủ danh sách lựa chọn (pbt-choice-review), không chỉ 1 dòng 'đã chọn'", () => {
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page.split('<ul className="pbt-choice-review">').length - 1).toBe(2);
    expect(page).toContain("choice === r.answer_text");
  });

  it("chỉ đánh dấu đúng/sai lên lựa chọn đã chọn (class 'chosen'), các lựa chọn khác không có class gì — không gián tiếp lộ đáp án đúng", () => {
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page.split('className={choice === r.answer_text ? (r.is_correct ? "chosen is-correct" : "chosen is-wrong") : ""}').length - 1).toBe(2);
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
