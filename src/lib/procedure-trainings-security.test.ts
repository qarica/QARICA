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

  it("is reachable from the sidebar behind procedure_training.view OR document_publication.view (child row inside the merged QUẢN LÝ VĂN BẢN group — combined Phổ biến & đào tạo tracking menu, alongside Kiểm soát tài liệu)", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "Phổ biến & đào tạo", href: "/procedure-trainings", icon: "book-open", anyPermissions: ["procedure_training.view", "document_publication.view"] }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/procedure-trainings/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/procedure-trainings/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
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
    expect(client).toContain('const [view, setView] = useState<"training" | "self_read">("training");');
    expect(client).toContain('<button type="button" className={view === "training" ? "active" : ""} aria-pressed={view === "training"} onClick={() => setView("training")}>');
    expect(client).toContain('<button type="button" className={view === "self_read" ? "active" : ""} aria-pressed={view === "self_read"} onClick={() => setView("self_read")}>');
  });

  it("trang server fetch văn bản Tự đọc hiểu đúng điều kiện API acknowledge chấp nhận (PUBLISHED, request_type NEW, dissemination_type SELF_READ)", () => {
    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('.eq("stage", "PUBLISHED")');
    expect(page).toContain('.eq("request_type", "NEW")');
    expect(page).toContain('.eq("dissemination_type", "SELF_READ")');
    expect(page).toContain("selfReadDocuments={selfReadDocs as any}");
  });

  it("tab Tự đọc hiểu tái dùng nguyên API /acknowledge đã có sẵn, cùng 1 nguồn sự thật (không tạo route xác nhận thứ 2)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("fetch(`/api/document-publications/${doc.id}/acknowledge`, { method: \"POST\" })");
    expect(client).toContain('"Tôi đã đọc và hiểu"');
    expect(client).toContain("✓ Bạn đã xác nhận");
  });

  it("nút mở danh sách chưa xác nhận chỉ hiện với canManageDocuments (document_publication.manage), tách biệt canManage (procedure_training.manage) của tab đào tạo", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("canManageDocuments: boolean");
    expect(client).toContain("canManageDocuments ? (\n                          <button type=\"button\" className=\"button tertiary small\" onClick={() => setUnconfirmedOpenId(unconfirmedOpenId === d.id ? null : d.id)}>");
    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain('const canManageDocuments = hasPermission(user, "document_publication.manage");');
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

  // "kỳ thi nào" — thêm/xoá đợt kiểm tra tự do, không giới hạn Pre/Post.
  it("tab Nhân sự & điểm cho thêm đợt kiểm tra tự do (không giới hạn Pre/Post) và sửa điểm theo từng ô (đợt × người)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("void addRound()");
    expect(client).toContain("void removeRound(r)");
    expect(client).toContain("startScoreEdit(a.id, r.id");
    expect(client).toContain("void saveScoreEdit()");
  });

  // "Muốn xem 1 người thì làm sao tra cứu bao nhiêu điểm, sai câu nào đúng
  // câu nào" — panel chi tiết hiện điểm + từng câu đúng/sai theo từng đợt.
  it("panel 'Xem chi tiết' 1 người hiện điểm theo từng đợt VÀ đúng/sai từng câu (khi có), không chỉ điểm tổng", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain("function AttendeeDetailPanel");
    expect(client).toContain("resp.is_correct ? \"Đúng\" : \"Sai\"");
    expect(client).toContain("Câu {resp.question_no}:");
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

  it("API đáp án (GET/PUT) tách view/manage, thay toàn bộ danh sách khi lưu (không sửa từng câu lẻ tẻ)", () => {
    const route = read("src/app/api/procedure-trainings/[id]/questions/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.view")');
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("training_id", trainingId).eq("organization_id", organizationId)'); // xoá hết trước khi ghi lại
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
  // trước đây chỉ có bảng số, không có biểu đồ trực quan. Thêm biểu đồ cột
  // ngang dùng lại component dùng chung TqmHorizontalBars (src/components/
  // tqm-charts.tsx, đã qua dataviz skill's validator) cho cả 5 biểu đồ —
  // không build riêng 1 bộ biểu đồ mới. "So sánh trước/sau theo đơn
  // vị" ban đầu thử TqmMultiTrend (đường nối nhiều kỳ) nhưng với vài chục
  // đơn vị không theo thứ tự thời gian thật, trục ngang bị chữ chồng lên
  // nhau và đường nối ngụ ý 1 xu hướng liên tục giữa các đơn vị không liên
  // quan — gây hiểu lầm, không chỉ là xấu. Đổi sang cột ngang chênh lệch
  // (trị tuyệt đối, sắp xếp giảm dần, tông xanh lá/đỏ kèm số +/- rõ ràng
  // trong caption — không chỉ dựa vào màu vì xanh lá/đỏ không phân biệt
  // được với mù màu đỏ-lục, đúng ghi chú ở đầu tqm-charts.tsx).
  it("AnalysisTab dùng TqmHorizontalBars (component biểu đồ dùng chung, đã qua dataviz validator) cho cả 5 biểu đồ (theo đợt, trước/sau theo đơn vị, theo đơn vị, theo chức danh, độ khó câu), không phải chỉ có bảng số — và nạp đúng TQM_CHART_CSS (plain <style>, không phải <style jsx>, vì Tqm* là component con khác, style jsx không scope qua được)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('import { TQM_CHART_CSS, TqmHorizontalBars } from "@/components/tqm-charts"');
    const analysisStart = client.indexOf("function AnalysisTab");
    const analysisEnd = client.indexOf("function groupByBeforeAfter");
    const analysisSrc = client.slice(analysisStart, analysisEnd);
    expect(analysisSrc.match(/<TqmHorizontalBars/g)?.length).toBe(5);
    expect(analysisSrc).toContain("<style>{TQM_CHART_CSS}</style>");
    expect(analysisSrc).not.toContain("TqmMultiTrend");
  });

  it("biểu đồ so sánh trước/sau theo đơn vị dùng chênh lệch tuyệt đối + tông xanh/đỏ kèm số +/- rõ trong caption (không chỉ dựa vào màu để phân biệt tăng/giảm)", () => {
    const client = read("src/components/procedure-training-detail-client.tsx");
    expect(client).toContain('tone: (r.delta as number) >= 0 ? ("green" as const) : ("red" as const)');
    expect(client).toContain('caption: `${(r.before as number).toFixed(1)} → ${(r.after as number).toFixed(1)} (${(r.delta as number) >= 0 ? "+" : ""}${(r.delta as number).toFixed(1)})`');
  });
});
