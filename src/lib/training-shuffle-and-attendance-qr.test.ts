import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { shuffleItems } from "./training-self-test";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// ---------------------------------------------------------------------------
// "Chưa có chức năng trộn thứ tự câu hỏi"
describe("Trộn thứ tự câu hỏi — hàm shuffleItems (hành vi thật)", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];

  it("không sửa mảng đầu vào và giữ nguyên tập phần tử (chỉ đổi thứ tự)", () => {
    const copy = items.slice();
    const out = shuffleItems(items);
    expect(items).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
    expect(out).toHaveLength(items.length);
  });

  it("deterministic theo hàm random truyền vào (test được) và random=0 cho thứ tự xoay vòng xác định", () => {
    const zero = () => 0;
    expect(shuffleItems([1, 2, 3, 4], zero)).toEqual(shuffleItems([1, 2, 3, 4], zero));
    expect(shuffleItems([1, 2, 3, 4], zero)).toEqual([2, 3, 4, 1]);
  });

  it("mảng rỗng / 1 phần tử trả nguyên vẹn", () => {
    expect(shuffleItems([])).toEqual([]);
    expect(shuffleItems([42])).toEqual([42]);
  });

  it("với random thật, qua nhiều lần trộn có xuất hiện thứ tự khác nhau (không luôn ra cùng 1 thứ tự)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(shuffleItems(items).join(","));
    expect(seen.size).toBeGreaterThan(5);
  });

  it("mỗi vị trí có thể nhận mọi phần tử (không thiên lệch mất hẳn 1 vị trí): đếm phần tử đầu qua nhiều lần", () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 400; i++) firsts.add(shuffleItems(items)[0]);
    expect(firsts.size).toBe(items.length);
  });
});

describe("Trộn thứ tự câu hỏi — nối vào route/giao diện", () => {
  it("migration chỉ thêm cột shuffle_questions mặc định false (không đổi hành vi các đợt đang chạy)", () => {
    const mig = read("supabase/migrations/20261201000002_procedure_training_shuffle_and_attendance_qr_v1.sql");
    expect(mig).toContain("add column if not exists shuffle_questions boolean not null default false");
    expect(mig).not.toMatch(/drop |delete |truncate /i);
  });

  it("route công khai trộn Ở SERVER chỉ khi đợt bật shuffle_questions, vẫn không trả correct_answer", () => {
    const route = read("src/app/api/public/training-test/[roundId]/route.ts");
    expect(route).toContain("shuffle_questions");
    expect(route).toContain("questions: round.shuffle_questions ? shuffleItems(publicQuestions) : publicQuestions,");
    // Câu truy vấn lấy câu hỏi cho trang công khai KHÔNG được chọn cột correct_answer (chú thích
    // trong file có nhắc tên cột nên không so chuỗi toàn file).
    expect(route).toContain('.select("question_no,question_text,choices")');
    expect(route).not.toMatch(/\.select\("[^"]*correct_answer/);
  });

  it("route admin: chỉ nhận boolean thật cho shuffle_questions, đòi procedure_training.manage, chặn theo tổ chức", () => {
    const route = read("src/app/api/procedure-trainings/[id]/rounds/[roundId]/route.ts");
    expect(route).toContain("if (body.shuffle_questions !== undefined) update.shuffle_questions = body.shuffle_questions === true;");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("organization_id", organizationId)');
    expect(route).toContain("is_open_for_submission,shuffle_questions");
  });

  it("trang làm bài sắp lại kết quả theo ĐÚNG thứ tự người làm bài đã thấy; đáp án vẫn gửi theo question_no", () => {
    const page = read("src/app/lam-bai/[roundId]/page.tsx");
    expect(page).toContain("const seenOrder = new Map(state.questions.map((q, i) => [q.question_no, i]));");
    expect(page).toContain("perQuestion: [...submitted.perQuestion].sort(");
    expect(page).toContain("answers: state.questions.map((q) => ({ question_no: q.question_no, answer_text: answers[q.question_no] || \"\" })),");
  });

  it("giao diện quản trị có công tắc Trộn câu hỏi theo từng đợt", () => {
    const ui = read("src/components/procedure-training-detail-client.tsx");
    expect(ui).toContain("async function toggleRoundShuffle(round: Round)");
    expect(ui).toContain("body: JSON.stringify({ shuffle_questions: !round.shuffle_questions }),");
    expect(ui).toContain("Trộn câu hỏi");
  });
});

// ---------------------------------------------------------------------------
// "Tập huấn chỉ quét QR điểm danh, chưa cần làm test"
describe("Tập huấn chỉ điểm danh qua QR — route công khai", () => {
  const route = read("src/app/api/public/training-attendance/[trainingId]/route.ts");

  it("công khai (không đăng nhập) nhưng chỉ chạy khi lớp ĐANG MỞ điểm danh — cả GET lẫn POST", () => {
    expect(route).not.toContain("requireApiPermission");
    // GET: lớp đóng → chỉ trả open:false (không trả khoa/phòng hay nội dung gì khác).
    const getPart = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(getPart).toContain('.select("id,organization_id,procedure_name,is_open_for_attendance,is_attendance_only")');
    expect(getPart.indexOf("if (!training.is_open_for_attendance || !training.is_attendance_only)")).toBeLessThan(getPart.indexOf('from("departments")'));
    // POST: kiểm tra đang mở TRƯỚC khi đụng tới bảng người tham dự.
    const postPart = route.slice(route.indexOf("export async function POST"));
    expect(postPart.indexOf("if (!training.is_open_for_attendance || !training.is_attendance_only)")).toBeGreaterThan(-1);
    expect(postPart.indexOf("if (!training.is_open_for_attendance || !training.is_attendance_only)")).toBeLessThan(postPart.indexOf('from("procedure_training_attendees")'));
    expect(route).toContain('{ error: "Lớp tập huấn hiện chưa mở điểm danh." }, { status: 403 }');
    expect(route).toContain("if (!training.is_open_for_attendance || !training.is_attendance_only) {\n    return NextResponse.json({ ok: true, open: false");
  });

  it("không lộ danh sách người tham dự: GET chỉ trả tên lớp + khoa/phòng; POST chỉ trả đúng người vừa quét", () => {
    const getPart = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(getPart).not.toContain("procedure_training_attendees");
    expect(route).not.toContain("correct_answer");
  });

  it("xác minh khoa/phòng thuộc đúng tổ chức của lớp trước khi dùng (không tin client)", () => {
    expect(route).toContain('.eq("id", departmentId).eq("organization_id", training.organization_id)');
    expect(route).toContain('{ error: "Đơn vị công tác không hợp lệ." }, { status: 400 }');
  });

  it("dùng đúng nguồn điểm danh có sẵn (attended/attended_at) — không tạo bảng/kết quả bài test", () => {
    expect(route).toContain("attended: true,");
    expect(route).toContain("attended_at: today,");
    expect(route).toContain("checked_in_at: now.toISOString(),");
    expect(route).not.toContain("procedure_training_results");
    expect(route).not.toContain("procedure_training_responses");
  });

  it("quét lại không làm gì thêm (alreadyCheckedIn) và trả về TRƯỚC khi ghi; không ghi đè đơn vị/chức danh đã có", () => {
    expect(route.indexOf("alreadyCheckedIn: true")).toBeGreaterThan(-1);
    expect(route.indexOf("alreadyCheckedIn: true")).toBeLessThan(route.indexOf(".update(patch)"));
    expect(route).toContain("if (!matched.department && departmentName) patch.department = departmentName;");
    expect(route).toContain("if (!matched.job_title && jobTitle) patch.job_title = jobTitle;");
  });

  it("khớp người đã có theo mã NV chuẩn hoá rồi tới tên (cùng cách với route tự làm bài), tránh tạo trùng", () => {
    expect(route).toContain("normalizeEmployeeCode(a.employee_code) === normalizedCode");
    expect(route).toContain("namesMatch(a.employee_name, employeeName)");
  });
});

describe("Tập huấn chỉ điểm danh qua QR — trang công khai, quản trị, migration", () => {
  it("migration chỉ thêm cột (mặc định đóng/false), không đụng dữ liệu cũ", () => {
    const mig = read("supabase/migrations/20261201000002_procedure_training_shuffle_and_attendance_qr_v1.sql");
    expect(mig).toContain("add column if not exists is_attendance_only boolean not null default false");
    expect(mig).toContain("add column if not exists is_open_for_attendance boolean not null default false");
    expect(mig).toContain("add column if not exists checked_in_at timestamptz");
    expect(mig).not.toMatch(/drop |delete |truncate |update public/i);
  });

  it("trang /diem-danh/[trainingId] có đủ trạng thái đóng / không tìm thấy / thành công / đã điểm danh trước đó", () => {
    const page = read("src/app/diem-danh/[trainingId]/page.tsx");
    expect(page).toContain("hiện chưa mở điểm danh");
    expect(page).toContain("Không tìm thấy lớp tập huấn này");
    expect(page).toContain("Điểm danh thành công");
    expect(page).toContain("Bạn đã điểm danh trước đó");
    expect(page).toContain("/api/public/training-attendance/${trainingId}");
    expect(read("middleware.ts")).toContain('path.startsWith("/diem-danh/")');
  });

  it("PATCH lớp: nhận is_attendance_only / is_open_for_attendance dạng boolean thật; hoàn thành lớp đóng luôn link điểm danh", () => {
    const route = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(route).toContain("update.is_attendance_only = body.is_attendance_only === true;");
    expect(route).toContain("update.is_open_for_attendance = body.is_open_for_attendance === true;");
    expect(route).toContain("update.is_open_for_attendance = false;");
    expect(route).toContain("is_attendance_only,is_open_for_attendance");
    // chuyển sang chế độ chỉ điểm danh thì đóng link làm bài của mọi đợt kiểm tra
    expect(route).toContain('update.status === "TRAINED" || update.is_attendance_only === true');
  });

  it("nhân bản lớp (tạo lớp mới cùng chủ đề) giữ chế độ; link điểm danh luôn bắt đầu đóng", () => {
    const dup = read("src/app/api/procedure-trainings/[id]/duplicate/route.ts");
    expect(dup).toContain("is_attendance_only: !!source.is_attendance_only,");
    expect(dup).not.toContain("is_open_for_attendance: true");
  });

  it("giao diện: tab Điểm danh + QR; chế độ chỉ điểm danh ẩn tab bài test và panel đợt kiểm tra", () => {
    const ui = read("src/components/procedure-training-detail-client.tsx");
    expect(ui).toContain('...(attendanceOnly ? ([["attendance", "Điểm danh"]] as [typeof tab, string][]) : []),');
    expect(ui).toContain("`${window.location.origin}/diem-danh/${trainingId}`");
    expect(ui).toContain("...(attendanceOnly ? [] : ([[\"questions\", \"Câu hỏi & đáp án\"]]");
    expect(ui).toContain("...(attendanceOnly ? [] : ([[\"analysis\", \"Phân tích\"]]");
    expect(ui).toContain("{attendanceOnly ? null : (\n      <section className=\"panel\">");
    expect(ui).toContain("async function toggleAttendanceOnly()");
    expect(ui).toContain("Dữ liệu bài test đã có KHÔNG bị xoá.");
    // không có <style jsx> mới chứa selector nhắm helper (CLAUDE.md gotcha) — tab mới dùng class sẵn có
    expect(ui).toContain("ptd-registration-open-toggle");
  });

  it("danh sách lớp hiện huy hiệu Chỉ điểm danh", () => {
    expect(read("src/components/procedure-trainings-client.tsx")).toContain("Chỉ điểm danh");
    expect(read("src/components/procedure-trainings-page.tsx")).toContain("is_attendance_only");
  });
});
