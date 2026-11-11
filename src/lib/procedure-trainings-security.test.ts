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

  // Real finding from a full-app review: the edit form built editDraft state
  // for trainer, feedback_qlcl, session_2_* and notes (all processed fine by
  // this same PATCH route and all selected back from the DB) but never
  // rendered an <input> for any of them — a classic UI-form-state-exists-but-
  // no-field-renders bug (CLAUDE.md principle 5: UI form state -> submitted
  // body -> API handling -> SELECT must all agree). Fixed by adding the 4
  // missing columns/inputs.
  it("the edit UI actually renders inputs for trainer, session 2, feedback_qlcl and notes (not just tracked in state)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain('placeholder="Người đào tạo..."');
    expect(client).toContain("editDraft.trainer");
    expect(client).toContain("editDraft.session_2_time");
    expect(client).toContain("editDraft.session_2_location");
    expect(client).toContain("editDraft.session_2_method");
    expect(client).toContain('placeholder="Phản hồi QLCL..."');
    expect(client).toContain("editDraft.feedback_qlcl");
    expect(client).toContain('placeholder="Ghi chú..."');
    expect(client).toContain("editDraft.notes");
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

  it("the table shows the completion rate and a roster manager, with add/toggle/remove gated behind canManage (not just viewable)", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("Quản lý nhân sự");
    expect(client).toContain("t.attendee_attended}/{t.attendee_total}");
    expect(client).toContain('canManage ? (\n            <div className="pt-roster-add-form">');
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

// Báo cáo thực tế: "A muốn cập nhật vào quản lý đào tạo" — báo cáo Pre/Post-
// test đánh giá hiệu quả đào tạo (điểm theo từng người) không có chỗ lưu:
// procedure_training_attendees trước đây chỉ có attended (có/vắng). Thang
// điểm bài test là thuộc tính của CẢ đợt đào tạo (mọi người làm cùng 1 bài),
// nên đặt ở procedure_trainings (test_score_max); điểm Pre/Post là thuộc
// tính của từng người, đặt ở procedure_training_attendees. Cả 2 đều nullable
// — không bắt buộc, các đợt đào tạo chỉ điểm danh vẫn hoạt động như cũ.
describe("Procedure trainings: điểm Pre/Post-test theo từng người (đánh giá hiệu quả đào tạo)", () => {
  it("migration thêm test_score_max (ở procedure_trainings) và pre_test_score/post_test_score (ở procedure_training_attendees), đều nullable", () => {
    const migration = read("supabase/migrations/20261128000000_procedure_training_pre_post_test_scores_v1.sql");
    expect(migration).toContain("alter table public.procedure_trainings");
    expect(migration).toContain("add column if not exists test_score_max numeric");
    expect(migration).toContain("alter table public.procedure_training_attendees");
    expect(migration).toContain("add column if not exists pre_test_score numeric");
    expect(migration).toContain("add column if not exists post_test_score numeric");
  });

  it("API training (PATCH) và attendees (POST/PATCH) đọc/ghi đủ 3 field — field trong form state -> body gửi lên -> API xử lý -> SELECT trả về phải khớp nhau (CLAUDE.md nguyên tắc 5)", () => {
    const trainingRoute = read("src/app/api/procedure-trainings/route.ts");
    expect(trainingRoute).toContain("test_score_max");
    const trainingIdRoute = read("src/app/api/procedure-trainings/[id]/route.ts");
    expect(trainingIdRoute).toContain('"test_score_max",');
    expect(trainingIdRoute).toMatch(/SELECT_COLUMNS =\s*\n?\s*"[^"]*test_score_max[^"]*";/);

    const attendeesRoute = read("src/app/api/procedure-trainings/[id]/attendees/route.ts");
    expect(attendeesRoute).toMatch(/SELECT_COLUMNS = "[^"]*pre_test_score[^"]*post_test_score[^"]*";/);
    expect(attendeesRoute).toContain("pre_test_score: preScore.score");
    expect(attendeesRoute).toContain("post_test_score: postScore.score");

    const attendeeIdRoute = read("src/app/api/procedure-trainings/[id]/attendees/[attendeeId]/route.ts");
    expect(attendeeIdRoute).toContain("update.pre_test_score = parsed.score");
    expect(attendeeIdRoute).toContain("update.post_test_score = parsed.score");
  });

  it("client thực sự render input cho cả 3 field (không chỉ có trong state) — thêm mới lẫn sửa điểm người đã có, cộng với sửa thang điểm chung của đợt đào tạo", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    // Thang điểm chung của đợt đào tạo (test_score_max) — sửa 1 lần cho cả đợt.
    expect(client).toContain("rosterTraining.test_score_max");
    expect(client).toContain("void saveMaxScore()");
    // Thêm nhân sự mới kèm điểm Pre/Post ngay từ đầu.
    expect(client).toContain('placeholder="Điểm Pre-test"');
    expect(client).toContain('placeholder="Điểm Post-test"');
    expect(client).toContain("newPreScore");
    expect(client).toContain("newPostScore");
    // Sửa điểm cho người đã có sẵn trong danh sách.
    expect(client).toContain("startScoreEdit(a)");
    expect(client).toContain("void saveScoreEdit(a)");
    expect(client).toContain("scoreDraft.pre");
    expect(client).toContain("scoreDraft.post");
  });

  it(".pt-roster-add-form (grid) có escape hatch min-width:0 cho các ô input co giãn trên màn hẹp, giống quy ước các grid khác trong app", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain(".pt-roster-add-form {\n          display: grid;");
    expect(client).toContain(".pt-roster-add-form > * {\n          min-width: 0;\n        }");
  });
});

// Báo cáo thực tế: "Thông thường khi tập huấn đào tạo, anh sẽ tạo gg form
// hoặc microsoft form để khảo sát, sau đó xuất file để thống kê. Nếu áp
// dụng vào phần mềm thì nên làm như thế nào hay có thể import file lên
// qarica" — thay vì chỉ nhập tay từng người, cho import thẳng file khảo sát
// (Google/Microsoft Form xuất ra, mỗi cột 1 câu hỏi, số câu tùy file —
// src/lib/training-import.ts) hoặc file đã chấm sẵn, tự chấm theo đáp án
// khai báo riêng từng đợt, tự ghép Pre/Post theo tên (không ép ghép khi mơ
// hồ), xem trước trước khi lưu thật.
describe("Procedure trainings: import điểm Pre/Post-test từ file khảo sát (Google/Microsoft Form)", () => {
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

  it("API lưu thật (commit) luôn kiểm tra lại attendeeId thuộc đúng training_id + organization_id trước khi update — không tin dữ liệu client gửi lên", () => {
    const route = read("src/app/api/procedure-trainings/[id]/import/commit/route.ts");
    expect(route).toContain('requireApiPermission("procedure_training.manage")');
    expect(route).toContain('.eq("id", u.attendeeId)\n      .eq("training_id", trainingId)\n      .eq("organization_id", organizationId)');
  });

  it("client thực sự render đủ luồng: đáp án, chọn file, chọn nhóm mặc định khi file không có cột Nhóm, xem trước, xác nhận nhập", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("void saveAnswerKey()");
    expect(client).toContain("void previewImport()");
    expect(client).toContain("importDefaultGroup");
    expect(client).toContain("void commitImport()");
    expect(client).toContain("toggleImportRow");
  });
});
