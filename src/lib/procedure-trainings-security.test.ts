import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Theo dõi quy trình đào tạo: modeled off the real tracking sheet (mỗi quy
// trình mới là 1 dòng, theo dõi đào tạo lần 1/lần 2, tình trạng là 1 trong 3
// giá trị thật dùng trong sổ theo dõi — not derived from a date comparison).
describe("Procedure trainings module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain('requireApiPermission("procedure_training.view")');
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain('requireApiPermission("procedure_training.manage")');
    expect(read("src/app/api/procedure-trainings/[id]/route.ts")).toContain('requireApiPermission("procedure_training.manage")');
  });

  // Báo cáo thực tế: "Lớp tạo nhầm cũng không xóa được" — trước đây không có
  // cách xoá cả 1 lớp (procedure_trainings), chỉ xoá được đợt kiểm
  // tra/nhân sự/đăng ký riêng lẻ. DELETE dùng đúng quyền .manage + scope
  // theo organization_id, dựa vào "on delete cascade" của mọi bảng con
  // (attendees/registrations/rounds→results/questions) để không sót nguồn
  // sự thật phụ nào (CLAUDE.md nguyên tắc 2) — UI xoá có cảnh báo số nhân sự
  // đã có trước khi xoá.
  it("DELETE /api/procedure-trainings/[id] (xoá cả lớp) dùng đúng quyền .manage + scope theo organization_id", () => {
    const route = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(route).toContain("export async function DELETE(");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.from("procedure_trainings").delete().eq("id", id).eq("organization_id", organizationId)');

    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("async function removeTraining(");
    expect(client).toContain("method: \"DELETE\"");
    expect(client).toContain("t.attendee_total > 0");
  });

  it("is reachable from the sidebar behind procedure_training.view OR document_publication.view (child row inside the merged QUẢN LÝ VĂN BẢN group — combined Phổ biến & đào tạo tracking menu, alongside Kiểm soát tài liệu)", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "Phổ biến & đào tạo", href: "/procedure-trainings", icon: "book-open", anyPermissions: ["procedure_training.view", "document_publication.view"] }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/procedure-trainings/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  // "1 chủ đề đào tạo có thể có nhiều lớp khác nhau, chủ động khai báo thông
  // tin lớp và kế thừa thông tin đợt cũ, cho phép sửa lại" — "+ Tạo lớp mới
  // cùng chủ đề" là 1 thao tác GHI (tạo lớp mới + sao chép câu hỏi), phải
  // dùng đúng quyền .manage và scope theo organization_id cả lúc đọc lớp
  // nguồn lẫn lúc ghi lớp mới — không rò dữ liệu/quyền giữa tổ chức.
  it("scopes '+ Tạo lớp mới cùng chủ đề' (duplicate route) to .manage + organization_id on both read and write", () => {
    const route = read("src/app/api/procedure-trainings/[id]/duplicate/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("organization_id", organizationId)');
    expect(route).toContain("organization_id: organizationId");
    expect(route).toContain('.from("procedure_training_questions")');
    expect(route).toContain('status: "PLANNED"');
  });

  it("is its own table — not folded into incoming_documents or any other module", () => {
    const migration = read("supabase/migrations/20261017_procedure_trainings_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_trainings");
    expect(migration).not.toContain("create table if not exists public.incoming_documents");
    expect(migration).not.toContain("public.hsba_");
  });

  it("uses the exact 3 status values from the real tracking sheet, not a derived/computed status", () => {
    const migration = read("supabase/migrations/20261017_procedure_trainings_v1.sql");
    expect(migration).toContain("check (status in ('TRAINED','PLANNED','NOT_PLANNED'))");
    const route = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(route).toContain('if (!["TRAINED", "PLANNED", "NOT_PLANNED"].includes(body.status))');
  });

  // Báo cáo thực tế: "giao diện xấu và ko đẹp, cứng đờ ko kéo được" — sửa
  // tại-chỗ trong các ô bé xíu của bảng danh sách (12 cột) đã bị bỏ hẳn.
  // Thông tin đào tạo (trainer/session 2/feedback_qlcl/notes) giờ sửa ở 1
  // form riêng, full-width, trong trang chi tiết — không còn trong bảng
  // danh sách tổng quan nữa.
  it("thông tin đào tạo (trainer/session 2/feedback_qlcl/notes) sửa ở form riêng trong trang chi tiết, KHÔNG sửa-tại-chỗ trong bảng danh sách", () => {
    const listClient = read("src/components/procedure-trainings-client.tsx");
    expect(listClient).not.toContain("editDraft.trainer");
    expect(listClient).not.toContain("editDraft.feedback_qlcl");

    const detailClient = read("src/components/procedure-training-detail-client.tsx");
    expect(detailClient).toContain("draft.trainer");
    expect(detailClient).toContain("draft.session_2_time");
    expect(detailClient).toContain("draft.session_2_location");
    expect(detailClient).toContain("draft.session_2_method");
    expect(detailClient).toContain("draft.feedback_qlcl");
    expect(detailClient).toContain("draft.notes");
  });
});

// Real finding from a full-app review: status was ONE value for the whole
// quy trình — no way to answer "bao nhiêu % nhân sự khoa/phòng đã thực sự
// được đào tạo". Added a per-employee attendee roster (own table, own
// migration) so a completion rate can be computed, without changing the
// meaning of the existing overall status field.
describe("Procedure trainings track per-employee attendance for a real completion rate", () => {
  it("attendees live in their own table, tenant-scoped and cascade-deleted with their training", () => {
    const migration = read("supabase/migrations/20261025_procedure_training_attendees_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_training_attendees");
    expect(migration).toContain("references public.procedure_trainings(id) on delete cascade");
    expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
  });

  it("attendee routes separate view (list) from manage (add/update/remove), scoped to the parent training's organization", () => {
    const listRoute = read("src/app/api/procedure-trainings/[id]/attendees/route.ts");
    expect(listRoute).toContain('requireApiPermission("procedure_training.view")');
    expect(listRoute).toContain('requireApiPermission("procedure_training.manage")');
    expect(listRoute).toContain('.eq("id", trainingId).eq("organization_id", organizationId)');

    const itemRoute = read("src/app/api/procedure-trainings/[id]/attendees/[attendeeId]/route.ts");
    expect(itemRoute).toContain('requireApiPermission("procedure_training.manage")');
    expect(itemRoute).toContain('.eq("training_id", trainingId)');
    expect(itemRoute).toContain('.eq("organization_id", organizationId)');
  });

  it("the main list computes a real completion rate (attended/total) with one aggregate query, not N+1 per row — in both the API and the SSR page", () => {
    const listApi = read("src/app/api/procedure-trainings/route.ts");
    expect(listApi).toContain('.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)');
    expect(listApi).toContain("attendee_total: counts.get(t.id)?.total || 0");

    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('.from("procedure_training_attendees").select("training_id,attended").in("training_id", trainingIds)');
  });

  // Báo cáo thực tế: "giao diện xấu... cứng đờ ko kéo được" — modal roster
  // nhồi hết mọi thứ (điểm danh/điểm số/nhập file) vào 1 hộp 560px đã bỏ.
  // Danh sách tổng quan giờ chỉ hiện tỷ lệ hoàn thành + liên kết sang trang
  // chi tiết riêng (/procedure-trainings/[id]).
  it("the overview list shows the completion rate and links to a dedicated detail page (not a cramped modal)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("t.attendee_attended}/{t.attendee_total}");
    expect(client).toContain("Xem chi tiết →");
    expect(client).toContain('href={`/procedure-trainings/${t.id}`}');
    expect(client).not.toContain("Quản lý nhân sự");
    expect(client).not.toContain("createPortal");

    const detailPage = read("src/app/(app)/procedure-trainings/[id]/page.tsx");
    expect(detailPage).toContain('requirePermission(user, "procedure_training.view")');
  });
});

// Báo cáo thực tế: "Phần theo dõi quy trình đào tạo chưa thấy kết nối với
// kiểm soát tài liệu. Vì tài liệu chia làm 2 loại là Tự đọc hiểu và cần đào
// tạo nên a nghĩ mình nên làm menu theo dõi gồm cả 2 nội dung này để control
// chứ ko đưa phần xác nhận vào thư viện văn bản" — trang này giờ có 2 tab
// (Cần đào tạo / Tự đọc hiểu), gộp cả 2 hình thức phổ biến tài liệu
// (DISSEMINATION_TYPES) vào đúng 1 menu theo dõi, thay vì "Tự đọc hiểu" nằm
// lạc trong Thư viện văn bản còn "Cần đào tạo" nằm riêng ở đây.
describe("Theo dõi phổ biến & đào tạo: gộp Tự đọc hiểu + Cần đào tạo vào 1 menu, 2 tab", () => {
  it("client có 2 tab Cần đào tạo / Tự đọc hiểu, mặc định mở tab Cần đào tạo", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain('const [view, setView] = useState<"training" | "self_read" | "topic">("training");');
    expect(client).toContain('<button type="button" className={view === "training" ? "active" : ""} aria-pressed={view === "training"} onClick={() => setView("training")}>');
    expect(client).toContain('<button type="button" className={view === "self_read" ? "active" : ""} aria-pressed={view === "self_read"} onClick={() => setView("self_read")}>');
  });

  // "1 chủ đề đào tạo có thể mở nhiều lớp nhiều đợt vào nhiều ngày khác
  // nhau... nếu tham gia đợt này nhưng cần học lại thì có thể đăng ký lại để
  // học lại đợt khác để đạt... chỉ tổng hợp kết quả nhân viên hoàn thành bài
  // đào tạo nhưng chỉ khác ngày hoàn thành" — tab thứ 3 "Theo chủ đề" LUÔN
  // hiện (báo cáo thực tế: "Ko thấy nút chủ đề" khi tab bị ẩn có điều kiện),
  // hiện trạng thái trống khi chưa có nhóm nào, gộp Đạt/Không đạt theo mã NV
  // qua các đợt bằng src/lib/procedure-training-topic-rollup.ts (dùng chung
  // computePassStatus, không tính lại logic lần 2).
  it("tab 'Theo chủ đề': gộp nhiều đợt đào tạo cùng chủ đề (document_publication_id hoặc tên chuẩn hoá), luôn hiện (có trạng thái trống)", () => {
    const lib = read("src/lib/procedure-training-topic-rollup.ts");
    expect(lib).toContain("export function topicKeyFor(");
    expect(lib).toContain('return `doc:${training.document_publication_id}`;');
    expect(lib).toContain('return `name:${training.procedure_name.trim().toLocaleLowerCase("vi")}`;');
    expect(lib).toContain("if (list.length < 2) groups.delete(key);");
    expect(lib).toContain("export function buildTopicCompletion(");
    expect(lib).toContain("if (!a.employee_code) continue;");

    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('import { buildTopicCompletion, groupTrainingsByTopic } from "@/lib/procedure-training-topic-rollup"');
    expect(page).toContain("topicGroups={topicGroups as any}");

    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).not.toContain("{topicGroups.length ? (");
    expect(client).toContain("!topicGroups.length ? (");
    expect(client).toContain('<button type="button" className={view === "topic" ? "active" : ""}');
  });

  it("trang server fetch văn bản Tự đọc hiểu đúng điều kiện đã dùng cho xác nhận công khai (PUBLISHED, request_type NEW, dissemination_type SELF_READ)", () => {
    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('.eq("stage", "PUBLISHED")');
    expect(page).toContain('.eq("request_type", "NEW")');
    expect(page).toContain('.eq("dissemination_type", "SELF_READ")');
    expect(page).toContain("selfReadDocuments={selfReadDocs as any}");
  });

  // Báo cáo thực tế: "Tài liệu tự đọc hiểu mình không nên xác nhận bên trong
  // QARICA mà chỉ xác nhận bằng QR hoặc link" — route /acknowledge trong app
  // đã bị xoá hẳn (không còn file), chỉ còn xác nhận qua /xac-nhan-doc-hieu/[id]
  // (công khai). "bên loại tự đọc hiểu cũng chưa có dashboard thống kê giám
  // sát" — thêm KPI strip + bảng tuân thủ theo khoa/phòng (departments.
  // staff_count làm mẫu số, vì acks giờ ẩn danh không so khớp được theo từng
  // tài khoản QARICA).
  it("KHÔNG còn route xác nhận trong app, KHÔNG còn nút 'Tôi đã đọc và hiểu' — chỉ còn link/QR công khai", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/document-publications/[id]/acknowledge/route.ts"))).toBe(false);
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).not.toContain("/acknowledge");
    expect(client).not.toContain("Tôi đã đọc và hiểu");
    expect(client).toContain("Link/QR gửi email");
    expect(client).toContain("/xac-nhan-doc-hieu/${doc.id}");
  });

  it("dashboard giám sát Tự đọc hiểu: KPI strip + bảng tuân thủ theo khoa/phòng dựa trên departments.staff_count", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("departments: DepartmentStaffCount[]");
    expect(client).toContain("const totalStaffFromDepartments = departments.reduce(");
    expect(client).toContain("Tuân thủ tự đọc hiểu theo khoa/phòng");
    expect(client).toContain("<KpiCard icon=\"folder-check\"");

    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('.from("departments").select("id,name,staff_count")');
    expect(page).toContain("departments={(departmentsData ?? []) as any}");
  });
});

// Báo cáo thực tế (vòng 2): "giao diện xấu..., Muốn xem 1 người thì làm sao
// tra cứu bao nhiêu điểm, sai câu nào đúng câu nào. kỳ thi nào. chưa có phân
// tích kết quả theo đối tượng, trước sau" — thiết kế vòng 1 (pre_test_score/
// post_test_score cố định 2 cột trên attendee) không trả lời được những câu
// hỏi này. Đổi sang 3 bảng: procedure_training_rounds (N đợt kiểm tra, không
// giới hạn 2), procedure_training_results (điểm/người/đợt), procedure_
// training_responses (câu trả lời + đúng/sai từng câu). Cột department/
// job_title tách khỏi notes (free text) để group-by được khi phân tích.
describe("Procedure trainings: nhiều đợt kiểm tra (round) + điểm theo từng đợt + đúng/sai từng câu", () => {
  it("migration tạo rounds + results + responses, cascade đúng thứ tự, và bỏ hẳn 2 cột pre/post cố định cũ", () => {
    const migration = read("supabase/migrations/20261130000000_procedure_training_rounds_results_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_training_rounds");
    expect(migration).toContain("references public.procedure_trainings(id) on delete cascade");
    expect(migration).toContain("unique(training_id, round_label)");
    expect(migration).toContain("create table if not exists public.procedure_training_results");
    expect(migration).toContain("references public.procedure_training_rounds(id) on delete cascade");
    expect(migration).toContain("unique(round_id, attendee_id)");
    expect(migration).toContain("create table if not exists public.procedure_training_responses");
    expect(migration).toContain("references public.procedure_training_results(id) on delete cascade");
    expect(migration).toContain("alter table public.procedure_training_attendees drop column if exists pre_test_score");
    expect(migration).toContain("alter table public.procedure_training_attendees drop column if exists post_test_score");
  });

  it("migration backfill dữ liệu thật đã nhập (25 người ATPT-HSBA) từ 2 cột cũ sang rounds + results trước khi xoá cột", () => {
    const migration = read("supabase/migrations/20261130000000_procedure_training_rounds_results_v1.sql");
    expect(migration).toContain("'Pre-test'");
    expect(migration).toContain("'Post-test'");
    expect(migration).toContain("where a.pre_test_score is not null");
    expect(migration).toContain("where a.post_test_score is not null");
  });

  it("department/job_title tách thành cột riêng (group-by được khi phân tích), không còn gộp vào notes dạng text tự do", () => {
    const migration = read("supabase/migrations/20261130000001_procedure_training_attendee_dept_title_v1.sql");
    expect(migration).toContain("add column if not exists department text");
    expect(migration).toContain("add column if not exists job_title text");
    const commitRoute = read("src/app/api/procedure-trainings/[id]/import/commit/route.ts");
    expect(commitRoute).toContain("department: action.dept");
    expect(commitRoute).toContain("job_title: action.title");
  });

  it("API rounds (GET/POST) và rounds/[roundId] (PATCH/DELETE) tách view/manage, tenant-scoped", () => {
    const listRoute = read("src/app/api/procedure-trainings/[id]/rounds/route.ts");
    expect(listRoute).toContain('requireApiPermission("procedure_training.view")');
    expect(listRoute).toContain('requireApiPermission("procedure_training.manage")');
    const itemRoute = read("src/app/api/procedure-trainings/[id]/rounds/[roundId]/route.ts");
    expect(itemRoute).toContain('requireApiPermission("procedure_training.manage")');
    expect(itemRoute).toContain('.eq("training_id", trainingId)');
    expect(itemRoute).toContain('.eq("organization_id", organizationId)');
  });

  it("API kết quả của 1 người (GET/POST results) gắn kèm đáp án đúng để tra đúng/sai, tenant-scoped qua chính attendee", () => {
    const route = read("src/app/api/procedure-trainings/[id]/attendees/[attendeeId]/results/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.view")');
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain("procedure_training_questions");
    expect(route).toContain("correct_answer: answerByQuestion.get(r.question_no)");
  });

  it("buildImportPlan tổng quát hoá: ghép theo cụm tên (không còn chỉ 2 nhóm Pre/Post cố định), mỗi hành động mang mảng results theo round_label bất kỳ", () => {
    const lib = read("src/lib/training-import.ts");
    expect(lib).toContain("roundLabel: string");
    expect(lib).not.toContain('"PRE" | "POST"');
    expect(lib).toContain("function clusterRows");
    expect(lib).toContain("results: ImportRoundResult[]");
  });

  it("client trang chi tiết (procedure-training-detail-client.tsx) có đủ 5 tab: Thông tin đào tạo, Nhân sự & điểm, Phân tích, Câu hỏi & đáp án, Nhập dữ liệu", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    for (const label of ["Thông tin đào tạo", "Nhân sự & điểm", "Phân tích", "Câu hỏi & đáp án", "Nhập dữ liệu"]) {
      expect(client).toContain(`"${label}"`);
    }
  });

  it("tab Nhân sự & điểm cho thêm/xoá đợt kiểm tra và sửa điểm theo từng ô (đợt × người)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("void addRound()");
    expect(client).toContain("void removeRound(r)");
    expect(client).toContain("startScoreEdit(a.id, r.id");
    expect(client).toContain("void saveScoreEdit()");
  });

  // "1 đợt đào tạo chỉ có 1 hoặc 2 tối đa test. nếu 1 chỉ có 1 post test
  // nếu cần đánh giá pre thì tối đa 2 cho 1 đợt. chứ ko thể mở nhiều đợt" —
  // chốt tối đa 2 đợt kiểm tra khi tạo THỦ CÔNG (không áp dụng cho route
  // nhập liệu hàng loạt import/commit, vốn find-or-create round theo đúng
  // tên cột trong file khảo sát thật để ghép dữ liệu lịch sử).
  it("tối đa 2 đợt kiểm tra/đợt đào tạo khi tạo thủ công — chặn ở cả client lẫn API, không áp dụng cho route import", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("if (rounds.length >= 2)");
    expect(client).toContain("rounds.length < 2 ?");

    const route = read("src/app/api/procedure-trainings/[id]/rounds/route.ts");
    expect(route).toContain("if ((existingCount ?? 0) >= 2)");
    expect(route).toContain("Mỗi đợt đào tạo tối đa 2 đợt kiểm tra (Pre-test + Post-test).");

    const importRoute = read("src/app/api/procedure-trainings/[id]/import/commit/route.ts");
    expect(importRoute).not.toContain("existingCount ?? 0) >= 2");
  });

  // "Chưa có bộ lọc hay gì đó để biết sau tập huấn bao nhiêu người pass,
  // bao nhiêu người học lại, danh sách" — thêm bộ đếm + bộ lọc theo Đạt/
  // Không đạt/Chưa có kết quả trên bảng Nhân sự & điểm, dùng CHÍNH
  // computePassStatus (1 nguồn sự thật với cột "Kết quả" và route xuất
  // Excel) để đếm/lọc, không tính lại logic lần 2.
  it("tab Nhân sự & điểm: bộ đếm + bộ lọc Đạt/Không đạt/Chưa có kết quả, dùng chung computePassStatus", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('const [resultFilter, setResultFilter] = useState<"all" | "pass" | "fail" | "none">("all")');
    expect(client).toContain("map.set(a.id, computePassStatus(resultsByAttendee.get(a.id) || [], rounds, passThreshold, a.attended))");
    expect(client).toContain("if (resultFilter !== \"all\" && statusByAttendeeId.get(a.id) !== resultFilter) return false;");
    expect(client).toContain("Không đạt — cần học lại ({statusCounts.fail})");
    expect(client).toContain("Chưa có kết quả ({statusCounts.none})");
  });

  // "Muốn xem 1 người thì làm sao tra cứu bao nhiêu điểm, sai câu nào đúng
  // câu nào" — panel chi tiết hiện điểm + từng câu đúng/sai theo từng đợt.
  // Đọc "quá ngắn gọn không hiểu" (chỉ hiện đáp án đã chọn, không có nội
  // dung câu hỏi lẫn các lựa chọn khác) — panel phải hiện đủ câu hỏi gốc và
  // toàn bộ lựa chọn, đánh dấu rõ đã chọn gì / đáp án đúng là gì.
  it("panel 'Xem chi tiết' 1 người hiện điểm theo từng đợt, đúng/sai từng câu, VÀ đủ nội dung câu hỏi + toàn bộ lựa chọn (không chỉ đáp án đã chọn)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function AttendeeDetailPanel");
    expect(client).toContain("resp.is_correct ? \"Đúng\" : \"Sai\"");
    expect(client).toContain("q?.question_text ? <p className=\"ptd-response-question\">{q.question_text}</p> : null");
    expect(client).toContain("choices.map((choice) => {");
    expect(client).toContain("isChosen ? <span className=\"ptd-choice-tag\">Đã chọn</span> : null");
    expect(client).toContain("isAnswerKey && !isChosen ? <span className=\"ptd-choice-tag\">Đáp án đúng</span> : null");
  });

  // "chưa có phân tích kết quả theo đối tượng, trước sau"
  it("tab Phân tích: điểm TB theo đợt, theo đơn vị, theo chức danh, và so sánh trước/sau theo đơn vị", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function AnalysisTab");
    expect(client).toContain("Điểm trung bình theo đợt kiểm tra");
    expect(client).toContain("Điểm trung bình theo đơn vị");
    expect(client).toContain("Điểm trung bình theo chức danh");
    expect(client).toContain("function groupByBeforeAfter");
    expect(client).toContain("Độ khó từng câu");
  });
});

// Báo cáo thực tế: "Thông thường khi tập huấn đào tạo, anh sẽ tạo gg form
// hoặc microsoft form để khảo sát, sau đó xuất file để thống kê. Nếu áp
// dụng vào phần mềm thì nên làm như thế nào hay có thể import file lên
// qarica" — thay vì chỉ nhập tay từng người, cho import thẳng file khảo sát
// (Google/Microsoft Form xuất ra, mỗi cột 1 câu hỏi, số câu tùy file —
// src/lib/training-import.ts) hoặc file đã chấm sẵn, tự chấm theo đáp án
// khai báo riêng từng đợt, tự ghép theo tên (không ép ghép khi mơ hồ), xem
// trước trước khi lưu thật.
describe("Procedure trainings: import điểm từ file khảo sát (Google/Microsoft Form)", () => {
  it("migration đáp án (procedure_training_questions) lưu 1 hàng/câu — số câu không cố định giữa các đợt đào tạo", () => {
    const migration = read("supabase/migrations/20261129000000_procedure_training_questions_v1.sql");
    expect(migration).toContain("create table if not exists public.procedure_training_questions");
    expect(migration).toContain("references public.procedure_trainings(id) on delete cascade");
    expect(migration).toContain("unique(training_id, question_no)");
  });

  it("API đáp án (GET/PUT) tách view/manage; PUT vẫn giữ để thay toàn bộ danh sách 1 lần khi dán từ file đáp án", () => {
    const route = read("src/app/api/procedure-trainings/[id]/questions/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.view")');
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("training_id", trainingId).eq("organization_id", organizationId)'); // xoá hết trước khi ghi lại
  });

  // "bỏ phần chung ở trên, chỉ cần phần nội dung câu hỏi và đáp án, và chọn
  // đáp án đúng luôn, không phải nhập 2 lần" — UI tab Câu hỏi & đáp án bỏ ô
  // dán đáp án hàng loạt, sửa/thêm/xoá từng câu một, chọn đáp án đúng ngay
  // trong các lựa chọn (radio) thay vì gõ lại đáp án ở chỗ khác.
  it("API soạn từng câu hỏi: POST thêm 1 câu mới, PATCH sửa cả correct_answer cùng lúc với nội dung/lựa chọn, DELETE xoá 1 câu", () => {
    const listRoute = read("src/app/api/procedure-trainings/[id]/questions/route.ts");
    expect(listRoute).toContain("export async function POST(request: Request");
    expect(listRoute).toContain('.order("question_no", { ascending: false })');

    const itemRoute = read("src/app/api/procedure-trainings/[id]/questions/[questionNo]/route.ts");
    expect(itemRoute).toContain("if (body.correct_answer !== undefined)");
    expect(itemRoute).toContain("export async function DELETE(");
    expect(itemRoute).toContain('requireApiPermission("procedure_training.manage")');
  });

  it("UI tab Câu hỏi & đáp án: không còn ô dán đáp án hàng loạt — mỗi câu tự chọn đáp án đúng trong danh sách lựa chọn (radio) của chính nó", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).not.toContain("Lưu đáp án (");
    expect(client).toContain("function QuestionEditorRow");
    expect(client).toContain('type="radio"');
    expect(client).toContain("Chưa chọn đáp án đúng trong các lựa chọn.");
    expect(client).toContain("+ Thêm câu hỏi");
  });

  it("API xem trước (import) KHÔNG ghi gì vào DB — chỉ đọc file + tính toán, để người dùng xác nhận trước khi lưu thật", () => {
    const route = read("src/app/api/procedure-trainings/[id]/import/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).not.toMatch(/\.(insert|update|delete)\(/);
    expect(route).toContain("buildImportPlan(scoredRows, existing)");
  });

  it("API xem trước dùng read-excel-file (không dùng exceljs — exceljs 4.4.0 đọc lỗi 'Cannot read properties of undefined' với file Excel thật xuất từ Google/Microsoft Form, đã tự kiểm chứng bằng file thật trước khi chọn thư viện)", () => {
    const route = read("src/app/api/procedure-trainings/[id]/import/route.ts");
    expect(route).toContain('import { readSheet } from "read-excel-file/node"');
    const pkg = read("package.json");
    expect(pkg).not.toContain('"exceljs"');
    expect(pkg).toContain('"read-excel-file"');
  });

  it("API lưu thật (commit) find-or-create đợt kiểm tra 1 lần cho cả batch, và luôn kiểm tra lại attendeeId thuộc đúng training_id + organization_id trước khi ghi kết quả — không tin dữ liệu client gửi lên", () => {
    const route = read("src/app/api/procedure-trainings/[id]/import/commit/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain("roundIdByLabel");
    expect(route).toContain('.eq("id", attendeeId).eq("training_id", trainingId).eq("organization_id", organizationId)');
  });

  it("client (tab Nhập dữ liệu) thực sự render đủ luồng: cảnh báo thiếu đáp án, chọn file, đặt tên đợt mặc định khi file không có cột Nhóm, xem trước (bỏ được từng dòng), xác nhận nhập", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function ImportTab");
    expect(client).toContain("void previewImport()");
    expect(client).toContain("defaultRoundLabel");
    expect(client).toContain("void commitImport()");
    expect(client).toContain("toggleRow");
  });

  // "E tester xem a thấy vẫn chưa ổn" — chụp màn hình ở viewport điện thoại
  // (390x844) cho thấy bảng nhân sự (RosterTab) và mọi bảng phân tích
  // (AnalysisTab) bị cắt cột ngang, không theo quy ước mobile-responsive đã
  // có sẵn trong repo (data-label + @media(max-width:760px) chuyển mỗi hàng
  // thành 1 thẻ, như .incoming-doc-overview/.physician-license-overview
  // trong final-visual-lock.css). Styled-jsx chỉ scope đúng component chứa
  // nó, nên RosterTab và AnalysisTab mỗi cái cần khối <style jsx> riêng.
  it("RosterTab: mọi <td> của bảng nhân sự có data-label, và có khối @media(max-width:760px) chuyển bảng thành thẻ trên điện thoại", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('<td data-label="Họ tên">');
    expect(client).toContain('<td data-label="Đơn vị">');
    expect(client).toContain('<td data-label="Chức danh">');
    expect(client).toContain('<td data-label="Đã đào tạo">');
    expect(client).toContain("data-label={r.round_label}");
    expect(client).toContain('<td data-label="Thao tác"');
    expect(client).toContain("@media (max-width: 760px) {");
    expect(client).toContain(".table-wrap tbody tr {");
    expect(client).toContain('.table-wrap tbody td[data-label]::before {');
  });

  it("AnalysisTab: mọi bảng (theo đợt/trước-sau/đơn vị/chức danh/độ khó câu) có data-label trên từng <td>, và có khối <style jsx> riêng với cùng quy ước mobile card", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    const analysisStart = client.indexOf("function AnalysisTab");
    const analysisEnd = client.indexOf("function groupByBeforeAfter");
    expect(analysisStart).toBeGreaterThan(-1);
    expect(analysisEnd).toBeGreaterThan(analysisStart);
    const analysisSrc = client.slice(analysisStart, analysisEnd);
    expect(analysisSrc).toContain('data-label="Đợt"');
    expect(analysisSrc).toContain('data-label={`${firstRound!.round_label} (TB)`}');
    expect(analysisSrc).toContain('data-label="Chênh lệch"');
    expect(analysisSrc).toContain('data-label="Chức danh"');
    expect(analysisSrc).toContain('data-label="Câu"');
    expect(analysisSrc).toContain("<style jsx>{`");
    expect(analysisSrc).toContain("@media (max-width: 760px) {");
  });

  // "Phần xem chi tiết có mở ra được gì đâu" — AttendeeDetailPanel trước đây
  // là 1 <section className="panel"> nối thêm vào CUỐI trang, sau cả bảng
  // nhân sự (có thể vài chục dòng) — bấm "Xem chi tiết" ở dòng đầu tiên
  // trong khi đang cuộn giữa trang thì panel mở ra ở tận đáy trang, ngoài
  // màn hình, trông như "không mở được gì". Sửa bằng cách dùng đúng quy ước
  // modal đã có sẵn của repo (.modal-backdrop/.modal-card/.modal-head —
  // position:fixed;inset:0, luôn hiện giữa màn hình bất kể đang cuộn ở đâu).
  it("AttendeeDetailPanel là modal overlay thật (.modal-backdrop/.modal-card/.modal-head), không còn là <section> nối cuối trang — luôn hiện trong màn hình dù đang cuộn ở đâu", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    const start = client.indexOf("function AttendeeDetailPanel");
    expect(start).toBeGreaterThan(-1);
    const panelSrc = client.slice(start, client.indexOf("\n}\n", start));
    expect(panelSrc).toContain('<div className="modal-backdrop">');
    expect(panelSrc).toContain('<div className="modal-card">');
    expect(panelSrc).toContain('<div className="modal-head">');
    expect(panelSrc).toContain('<div className="modal-body"');
    expect(panelSrc).not.toContain('<section className="panel">');
  });

  // "phần phân tích cũng ko xem được dạng biểu đồ để so sánh" — AnalysisTab
  // trước đây chỉ có bảng số, không có biểu đồ trực quan. "Chuyển hết các
  // biểu đồ hàng ngang thành biểu đồ cột để dễ so sánh" (phạm vi: chỉ tab
  // Phân tích đào tạo, xác nhận với người dùng — KHÔNG đụng ~20 trang khác
  // dùng chung TqmHorizontalBars) — 4 biểu đồ (theo đợt, theo đơn vị, theo
  // chức danh, độ khó câu) đổi từ TqmHorizontalBars (ngang) sang
  // TqmColumnBars (cột dọc, mới, dùng chung wrapLabel với TqmGroupedBars để
  // nhãn trục dưới không đè nhau khi nhiều hạng mục). "So sánh trước/sau
  // theo đơn vị" ban đầu thử TqmMultiTrend rồi cột ngang chênh lệch, cuối
  // cùng chốt TqmGroupedBars (cột dọc nhóm 2 cột/đơn vị, xem lịch sử ở
  // test khác) — vẫn giữ nguyên, không đổi thêm lần này.
  it("AnalysisTab dùng TqmColumnBars (cột dọc) cho 4 biểu đồ theo đợt/đơn vị/chức danh/độ khó câu, TqmGroupedBars riêng cho so sánh trước/sau — không còn TqmHorizontalBars nào, và nạp đúng TQM_CHART_CSS (plain <style>, không phải <style jsx>)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('import { TQM_CHART_CSS, TqmColumnBars, TqmGroupedBars } from "@/components/tqm-charts"');
    expect(client).not.toContain("TqmHorizontalBars");
    const analysisStart = client.indexOf("function AnalysisTab");
    const analysisEnd = client.indexOf("function groupByBeforeAfter");
    const analysisSrc = client.slice(analysisStart, analysisEnd);
    expect(analysisSrc.match(/<TqmColumnBars/g)?.length).toBe(4);
    expect(analysisSrc).toContain("<TqmGroupedBars");
    expect(analysisSrc).toContain("<style>{TQM_CHART_CSS}</style>");
    expect(analysisSrc).not.toContain("TqmMultiTrend");
  });

  // "Chuyển thành biểu đồ cột % trước sau để biết tăng bao nhiêu %" — Điểm
  // TB theo đợt (Pre/Post) quy ra % trên thang điểm (round.score_max) thay
  // vì so trực tiếp 2 số điểm thô, kèm 1 dòng chú thích tăng/giảm bao
  // nhiêu điểm % giữa đợt đầu và đợt cuối.
  it("biểu đồ Điểm trung bình theo đợt kiểm tra hiện theo % thang điểm + chú thích tăng/giảm bao nhiêu điểm %", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("round.score_max && average != null ? Math.round((average / round.score_max) * 1000) / 10 : null");
    expect(client).toContain("<TqmColumnBars rows={roundChartRows} max={100} unit=\"%\" />");
    expect(client).toContain("điểm % ({firstRoundPct}% → {lastRoundPct}%)");
  });

  // "Ko thấy tên đơn vị khoa phòng" — nhãn trục dưới của TqmGroupedBars bị
  // xoay chữ (-35°) chồng lấn/biến dạng khi nhiều đơn vị sát nhau. Sửa bằng
  // wrapLabel (bẻ dòng ngang, không xoay) dùng chung cho cả TqmGroupedBars
  // và TqmColumnBars, và gắn width/height làm thuộc tính SVG thật (không
  // chỉ CSS min-width) để khớp đúng viewBox, tránh trình duyệt co giãn lệch
  // tỷ lệ làm chữ biến dạng.
  it("TqmGroupedBars/TqmColumnBars dùng wrapLabel (bẻ dòng, không xoay chữ) + width/height gắn thẳng vào SVG khớp viewBox", () => {
    const charts = read("src/components/tqm-charts.tsx");
    expect(charts).toContain("function wrapLabel(label: string, maxCharsPerLine: number, maxLines: number): string[]");
    expect(charts).not.toContain("rotate(-35");
    expect(charts).toContain("export function TqmColumnBars(");
    expect(charts.match(/wrapLabel\(/g)?.length).toBeGreaterThanOrEqual(3);
    const groupedBarsSrc = charts.slice(charts.indexOf("export function TqmGroupedBars("), charts.indexOf("export function TqmColumnBars("));
    expect(groupedBarsSrc).toContain("<svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}");
    const columnBarsSrc = charts.slice(charts.indexOf("export function TqmColumnBars("));
    expect(columnBarsSrc).toContain("<svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}");
  });

  it("biểu đồ cột so sánh trước/sau theo đơn vị: 2 cột/đơn vị (trước, sau) + đường ngang mức điểm đạt (pass_threshold) cắt ngang", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("passThreshold: number | null");
    expect(client).toContain("groups={beforeAfter.map((r) => ({ label: r.key, before: r.before, after: r.after }))}");
    expect(client).toContain("threshold={passThreshold}");

    const charts = read("src/components/tqm-charts.tsx");
    expect(charts).toContain("export function TqmGroupedBars(");
    expect(charts).toContain("g.before != null");
    expect(charts).toContain("g.after != null");
    expect(charts).toContain("thresholdY");
    expect(charts).toContain("fill={COLORS.blue}");
    expect(charts).toContain("fill={COLORS.green}");
  });

  // "rất xấu" — nhãn "Mức đạt: X" neo cứng ở mép phải SVG đè lên cột/nhãn
  // số cuối cùng khi biểu đồ vừa khít nội dung; và nhãn số trên đầu cột bị
  // đường mốc (dashed) cắt ngang trông như số khác khi giá trị gần bằng
  // mốc (vd 13.0 cạnh mốc 14 trông như "43.0"). Sửa: bỏ hẳn nhãn chữ trong
  // SVG (giữ legend phía trên đã có đủ thông tin), và mọi nhãn số trên đầu
  // cột (TqmGroupedBars lẫn TqmColumnBars) dùng chung ValueLabel có nền
  // trắng che đường kẻ phía sau.
  it("TqmGroupedBars không còn in nhãn chữ 'Mức đạt: X' đè mép phải SVG; nhãn số trên đầu cột (cả TqmGroupedBars và TqmColumnBars) dùng ValueLabel có nền che đường kẻ", () => {
    const charts = read("src/components/tqm-charts.tsx");
    expect(charts).toContain("function ValueLabel(");
    expect(charts).not.toContain("{thresholdLabel}: {threshold}</text>");
    expect(charts).not.toMatch(/textAnchor="end"[^>]*>\{thresholdLabel\}/);
    const groupedBarsSrc = charts.slice(charts.indexOf("export function TqmGroupedBars("), charts.indexOf("export function TqmColumnBars("));
    expect(groupedBarsSrc.match(/<ValueLabel /g)?.length).toBe(2);
    const columnBarsSrc = charts.slice(charts.indexOf("export function TqmColumnBars("));
    expect(columnBarsSrc).toContain("<ValueLabel x={x + barW / 2} y={y - 5} text={`${r.value}${unit}`} fill=\"#172126\" />");
  });

  // Mẫu báo cáo tham khảo người dùng gửi (infographic Pre/Post): 3 ý được
  // chốt đưa vào — (1) thẻ KPI đầu trang (Tổng lượt làm bài + từng đợt),
  // (2) mục Tuyên dương liệt kê TOÀN BỘ người đạt điểm tuyệt đối (không
  // giới hạn top 3 như bảng xếp hạng), (3) so sánh trước/sau theo CHỨC
  // DANH (mirror đúng theo đơn vị, dùng chung groupByBeforeAfter đã tổng
  // quát hoá getKey thay vì hard-code a.department).
  it("tab Phân tích: KPI đầu trang (Tổng lượt làm bài + từng đợt), Tuyên dương toàn bộ điểm tuyệt đối, và so sánh trước/sau theo chức danh", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('import { KpiCard } from "@/components/kpi-card"');
    expect(client).toContain("const totalSubmissions = byRound.reduce((s, b) => s + b.count, 0);");
    expect(client).toContain('<KpiCard icon="users" tone="purple" label="Tổng lượt làm bài" value={totalSubmissions} />');

    expect(client).toContain("const maxScoreAchievers = lastRound && lastRound.score_max != null ? leaderboard.filter((row) => row.score === lastRound.score_max) : [];");
    expect(client).toContain("Tuyên dương — đạt điểm tuyệt đối");

    expect(client).toContain("function groupByBeforeAfter(attendees: Attendee[], results: ResultRow[], beforeRoundId: string, afterRoundId: string, getKey: (a: Attendee) => string | null = (a) => a.department)");
    expect(client).toContain("const beforeAfterByTitle =");
    expect(client).toContain("groupByBeforeAfter(attendees, results, firstRound.id, lastRound.id, (a) => a.job_title)");
    expect(client).toContain("So sánh trước/sau theo chức danh");
  });

  // "Thống kê danh sách kiểm tra điểm cao nhất xuống thấp nhất để dùng tuyên
  // dương" — bảng xếp hạng dựa trên điểm đợt kiểm tra CUỐI CÙNG (cùng khái
  // niệm "đợt cuối" với computePassStatus), chỉ xếp người đã có điểm ở đợt
  // đó, hạng kiểu thi đấu (điểm bằng nhau cùng hạng).
  it("tab Phân tích: bảng xếp hạng điểm cao → thấp theo đợt kiểm tra cuối cùng, dùng để tuyên dương", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("Bảng xếp hạng điểm");
    expect(client).toContain("dùng để tuyên dương");
    expect(client).toContain(".sort((a, b) => b.score - a.score)");
    expect(client).toContain("rank: 1 + arr.filter((x) => x.score > row.score).length");
    expect(client).toContain('data-label="Hạng"');
  });
});
