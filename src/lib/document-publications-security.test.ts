import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Phát hành văn bản: modeled off a real, mature reference workflow the user
// built and ran before, generalized for QARICA's multi-organization
// architecture (no hard-coded hospital name/department, manual document
// code instead of an org-prefixed auto-generated one — CLAUDE.md principle 1).
describe("Document publications module security and control gates", () => {
  it("POST (Đề nghị) only requires document_publication.view — any unit can submit a request, not just managers", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('requireApiPermission("document_publication.view")');
    expect(route).not.toContain('requireApiPermission("document_publication.manage")');
  });

  it("PATCH (every step past Đề nghị) requires document_publication.manage", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('requireApiPermission("document_publication.manage")');
  });

  it("the create-request form in the client renders unconditionally (not gated behind canManage), matching the API's looser .view-only POST", () => {
    const client = read("src/components/document-publications-client.tsx");
    // Scoped to the "Đề nghị văn bản mới" section only — canManage legitimately
    // gates other, unrelated UI further down (Delete button, Xem who-hasn't-
    // acknowledged-yet toggle), which must stay manager-only.
    const formSection = client.slice(client.indexOf("Đề nghị văn bản mới"), client.indexOf("Đang xử lý"));
    expect(formSection).not.toContain("{canManage ? (");
    expect(client).toContain("Đề nghị văn bản mới");
  });

  it("is reachable from the sidebar only behind document_publication.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "KIỂM SOÁT TÀI LIỆU", href: "/document-publications", icon: "file-text", permission: "document_publication.view" }');
  });

  it("keeps every query/write tenant-scoped by organization_id", () => {
    const list = read("src/app/api/document-publications/route.ts");
    expect(list).toContain('.eq("organization_id", organizationId)');
    expect(list).toContain("organization_id: organizationId");
    const item = read("src/app/api/document-publications/[id]/route.ts");
    expect(item).toContain('.eq("organization_id", organizationId)');
  });

  it("stores document codes manually (no org-prefixed auto-generated code) and assigns the reviewing department at request time, per the no-hard-coded-organization principle", () => {
    const migration = read("supabase/migrations/20261020_document_publications_v1.sql");
    expect(migration).toContain("no hard-coded hospital name");
    expect(migration).not.toMatch(/TTSG/);
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('String(body.document_code || "").trim()');
  });
});

describe("Document publications 6-stage pipeline (src/lib/document-publication-types.ts)", () => {
  const types = read("src/lib/document-publication-types.ts");

  it("defines the exact 6 stages in order: Đề nghị -> Soạn thảo -> Góp ý -> Rà soát -> Phê duyệt -> Phát hành", () => {
    expect(types).toContain(
      'export const DOCUMENT_PUBLICATION_STAGES = [\n  "REQUESTED",\n  "DRAFTING",\n  "COLLECTING_FEEDBACK",\n  "REVISING",\n  "APPROVING",\n  "PUBLISHED",\n] as const;',
    );
  });

  it("nextStage() advances one step at a time and returns null after PUBLISHED (no transition past the end)", () => {
    expect(types).toContain("export function nextStage(stage: DocumentPublicationStage): DocumentPublicationStage | null {");
    expect(types).toContain("if (idx < 0 || idx === DOCUMENT_PUBLICATION_STAGES.length - 1) return null;");
  });

  it("defines 4 document types, each mapped to an informational approver label (not permission-enforced in Đợt 1 — QARICA lacks Ban Giám Đốc sub-roles yet)", () => {
    expect(types).toContain('export const DOCUMENT_TYPES = ["OPERATIONAL", "CLINICAL_PROCEDURE", "CLINICAL_PROTOCOL", "NURSING"] as const;');
    expect(types).toContain("OPERATIONAL: \"GĐ Điều hành\",");
    expect(types).toContain("CLINICAL_PROCEDURE: \"GĐ Chuyên môn\",");
  });

  it("the PATCH route recomputes stage_due_date from STAGE_DUE_DAYS on every advance, clearing it once PUBLISHED", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain("update.stage_due_date = addDaysISO(new Date().toISOString().slice(0, 10), STAGE_DUE_DAYS[upcoming]);");
    expect(route).toContain("update.stage_due_date = null;");
  });

  it("transitioning into PUBLISHED requires document_code + effective_date and computes review_date as effective_date + REVIEW_CYCLE_DAYS (730)", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });');
    expect(route).toContain('if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });');
    expect(route).toContain("update.review_date = addDaysISO(effectiveDate, REVIEW_CYCLE_DAYS);");
    const server = read("src/lib/document-publication-server.ts");
    expect(server).toContain("export const REVIEW_CYCLE_DAYS = 730;");
  });
});

// Phổ biến tài liệu sau khi phát hành: mô phỏng lại "Phiếu xác nhận thông
// hiểu tài liệu" thực tế (2 hình thức, chọn lúc Phát hành — thời điểm chốt
// nội dung cuối): SELF_READ (từng nhân viên tự xác nhận, theo dõi theo
// người) và TRAINING_REQUIRED (tự tạo 1 dòng Đào tạo quy trình, tái dùng
// workflow đào tạo sẵn có thay vì xây lại theo dõi đào tạo riêng cho văn bản).
describe("Document publications: phổ biến (dissemination) sau khi phát hành", () => {
  const patchRoute = read("src/app/api/document-publications/[id]/route.ts");

  it("requires an explicit dissemination_type (SELF_READ or TRAINING_REQUIRED) before PUBLISHED, same as document_code/effective_date", () => {
    expect(patchRoute).toContain('if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: "Chưa chọn hình thức phổ biến." }, { status: 400 });');
    expect(patchRoute).toContain("update.dissemination_type = disseminationType;");
  });

  it("TRAINING_REQUIRED auto-creates a procedure_trainings row linked back via document_publication_id, instead of building a separate training workflow for documents (shared helper, so both the normal advance-to-PUBLISHED path and direct-publish use the exact same insert)", () => {
    expect(patchRoute).toContain('if (disseminationType === "TRAINING_REQUIRED") {');
    expect(patchRoute).toContain("createTrainingForDocument(admin, {");
    expect(patchRoute).toContain("documentPublicationId: id,");
    const server = read("src/lib/document-publication-server.ts");
    expect(server).toContain('admin.from("procedure_trainings").insert({');
    expect(server).toContain("document_publication_id: params.documentPublicationId,");
  });

  it("SELF_READ acknowledgment only requires document_publication.view (any staff can self-confirm, not just managers) and only applies to a PUBLISHED, SELF_READ document", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain('requireApiPermission("document_publication.view")');
    expect(ackRoute).not.toContain('requireApiPermission("document_publication.manage")');
    expect(ackRoute).toContain('if (doc.stage !== "PUBLISHED" || doc.dissemination_type !== "SELF_READ")');
  });

  it("identity for an acknowledgment comes from auth.uid(), never hand-typed name/employee code/email like the old paper form", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain("user_id: auth.user.id,");
    expect(ackRoute).not.toContain("body.employee_code");
    expect(ackRoute).not.toContain("body.full_name");
  });

  it("acknowledging twice is idempotent (unique document_publication_id+user_id, upsert ignores duplicates) rather than erroring or double-counting", () => {
    const ackRoute = read("src/app/api/document-publications/[id]/acknowledge/route.ts");
    expect(ackRoute).toContain('{ onConflict: "document_publication_id,user_id", ignoreDuplicates: true }');
  });

  it("the acknowledgments table is tenant-scoped and tracks per-employee department for coverage reporting", () => {
    const migration = read("supabase/migrations/20261021_document_publication_dissemination_v1.sql");
    expect(migration).toContain("create table if not exists public.document_publication_acknowledgments");
    expect(migration).toContain("unique (document_publication_id, user_id)");
    expect(migration).toContain("department_id uuid references public.departments(id)");
  });

  it("the create-request form offers no dissemination_type field (it is chosen only at Phát hành, the moment content is finalized)", () => {
    const client = read("src/components/document-publications-client.tsx");
    const formSection = client.slice(client.indexOf("Đề nghị văn bản mới"), client.indexOf("Đang xử lý"));
    expect(formSection).not.toContain("disseminationType");
  });
});

// Yêu cầu tường minh: "cần chỗ để nhập các QT/quy định/thông báo đã phát
// hành lên" — tạo đề nghị rồi tự bấm "Chuyển bước" 5 lần cho một văn bản
// NGOÀI THỰC TẾ đã ban hành từ trước là vô nghĩa. Thêm đường nhập trực tiếp
// thẳng vào "Đã phát hành", bỏ qua toàn bộ vòng Đề nghị -> ... -> Phê duyệt,
// nhưng vẫn tái dùng đúng các quy tắc nghiệp vụ ở PUBLISHED (document_code/
// effective_date/dissemination_type bắt buộc, review_date = +730 ngày, tự
// tạo Đào tạo quy trình khi TRAINING_REQUIRED) qua helper dùng chung — không
// tạo một đường tạo PUBLISHED thứ 2 với luật khác luật cũ.
describe("Document publications: nhập trực tiếp văn bản ĐÃ PHÁT HÀNH (direct_publish)", () => {
  const route = read("src/app/api/document-publications/route.ts");

  it("direct_publish đòi document_publication.manage (bỏ qua toàn bộ vòng kiểm soát), không còn chỉ .view như Đề nghị thường", () => {
    expect(route).toContain("const directPublish = body.direct_publish === true;");
    expect(route).toContain('requireApiPermission(directPublish ? "document_publication.manage" : "document_publication.view")');
  });

  it("vẫn bắt buộc đủ document_code + effective_date hợp lệ + dissemination_type, giống hệt điều kiện ở bước Phê duyệt -> Phát hành thường", () => {
    expect(route).toContain('if (!documentCode) return NextResponse.json({ error: "Chưa nhập mã văn bản." }, { status: 400 });');
    expect(route).toContain('if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "Ngày hiệu lực không hợp lệ." }, { status: 400 });');
    expect(route).toContain("if (!isDisseminationType(disseminationType)) return NextResponse.json({ error: \"Chưa chọn hình thức phổ biến.\" }, { status: 400 });");
  });

  it("tạo bản ghi thẳng ở stage PUBLISHED, dùng chung REVIEW_CYCLE_DAYS và createTrainingForDocument với luồng chuyển bước thường (không lệch luật)", () => {
    expect(route).toContain('insertPayload.stage = "PUBLISHED";');
    expect(route).toContain("insertPayload.review_date = addDaysISO(effectiveDate, REVIEW_CYCLE_DAYS);");
    expect(route).toContain("createTrainingForDocument(admin, {");
    expect(route).toContain('action_type: directPublish ? "DOCUMENT_PUBLICATION_DIRECT_PUBLISH" : "DOCUMENT_PUBLICATION_CREATE",');
  });

  it("UI: panel \"Nhập văn bản đã phát hành\" chỉ hiện với canManage, gửi direct_publish:true", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("Nhập văn bản đã phát hành");
    expect(client).toContain("{canManage ? (\n        <section className=\"panel\">");
    expect(client).toContain("direct_publish: true,");
  });
});

// Yêu cầu tường minh: "chỉ bổ sung thư viện và các thư mục văn bản theo
// phòng ban thôi, giữ nguyên" — KHÔNG đổi pipeline/stage/dissemination đã có,
// chỉ cộng thêm 2 việc: (1) đính kèm file lưu trữ cho mỗi văn bản, (2) nhóm
// "Đã phát hành" thành thư mục theo khoa/phòng soạn thảo.
describe("Document publications: thư viện văn bản (đính kèm file + thư mục theo phòng ban)", () => {
  it("route file: POST (đính kèm)/DELETE (xoá file) đòi .manage, GET (xem/tải) chỉ cần .view", () => {
    const fileRoute = read("src/app/api/document-publications/[id]/file/route.ts");
    expect(fileRoute).toContain('export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("document_publication.manage");');
    expect(fileRoute).toContain('export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("document_publication.view");');
    expect(fileRoute).toContain('export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {\n  const auth = await requireApiPermission("document_publication.manage");');
  });

  it("route file: mọi truy vấn/update đều chặn theo organization_id của văn bản, không tin id trần từ client", () => {
    const fileRoute = read("src/app/api/document-publications/[id]/file/route.ts");
    expect(fileRoute).toContain("if (!doc || doc.organization_id !== organizationId)");
  });

  it("đường dẫn storage chia theo tổ chức + khoa/phòng soạn thảo (thư mục theo phòng ban), dùng chung bucket qlcl-evidence với EMR", () => {
    const fileRoute = read("src/app/api/document-publications/[id]/file/route.ts");
    expect(fileRoute).toContain('const BUCKET = "qlcl-evidence";');
    expect(fileRoute).toContain(
      "const storagePath = `${organizationId}/document-publications/${departmentFolderSlug(draftingDepartmentName)}/${id}/${randomUUID()}-${storedFileName}`;",
    );
  });

  it("đính kèm file mới thì xoá file cũ khỏi storage (không rò rỉ object orphan khi thay file)", () => {
    const fileRoute = read("src/app/api/document-publications/[id]/file/route.ts");
    expect(fileRoute).toContain("const previousPath = doc.file_path;");
    expect(fileRoute).toContain("if (previousPath) await admin.storage.from(BUCKET).remove([previousPath]);");
  });

  it("chỉ lộ file_name ra client qua SELECT_COLUMNS/select của trang, KHÔNG lộ file_path (đường dẫn storage) ra ngoài route file riêng", () => {
    const listRoute = read("src/app/api/document-publications/route.ts");
    expect(listRoute).toMatch(/SELECT_COLUMNS =\s*\n?\s*"[^"]*file_name[^"]*";/);
    expect(listRoute).not.toMatch(/SELECT_COLUMNS =\s*\n?\s*"[^"]*file_path[^"]*";/);
    const idRoute = read("src/app/api/document-publications/[id]/route.ts");
    expect(idRoute).toMatch(/SELECT_COLUMNS =\s*\n?\s*"[^"]*file_name[^"]*";/);
    const page = read("src/app/(app)/document-publications/page.tsx");
    expect(page).toContain("file_name,created_at");
  });

  it("migration chỉ cộng thêm 2 cột (file_path/file_name), không đổi cột/constraint nào khác của document_publications", () => {
    const migration = read("supabase/migrations/20261111_document_publications_file_library_v1.sql");
    expect(migration).toContain("alter table public.document_publications add column if not exists file_path text;");
    expect(migration).toContain("alter table public.document_publications add column if not exists file_name text;");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("alter table public.document_publications drop constraint");
  });

  it("UI: \"Đã phát hành\" được đổi thành Thư viện văn bản, nhóm theo thư mục khoa/phòng (đóng/mở theo state riêng), giữ nguyên toàn bộ workflow Phổ biến đã có", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("<h2>Thư viện văn bản</h2>");
    expect(client).toContain("publishedGroups.map((group) =>");
    expect(client).toContain("const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());");
    // Vẫn giữ nguyên cơ chế xác nhận "Tự đọc hiểu" / liên kết Đào tạo bên trong thư mục.
    expect(client).toContain('Cần đào tạo — xem tiến độ →');
    expect(client).toContain("Tôi đã đọc và hiểu");
  });

  it("UI: xem/tải file không cần canManage, nhưng đính kèm mới và xoá file chỉ hiện cho canManage", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("async function viewFile(doc: DocumentPublication) {");
    const fileCell = client.slice(client.indexOf("Tệp đính kèm"), client.indexOf("</tbody>", client.indexOf("Tệp đính kèm")));
    expect(fileCell).toContain("onClick={() => void viewFile(d)}");
    expect(fileCell).toContain('canManage ? (\n                                <button type="button" className="button tertiary small" disabled={fileBusyId === d.id} onClick={() => void removeFile(d)}>');
    expect(fileCell).toContain(': canManage ? (\n                            <label className="dp-file-input button secondary small">');
  });
});

// Yêu cầu tường minh: "có tính năng hỗ trợ báo các quy trình đến hạn [xem
// xét lại] và biết có bao nhiêu quy trình tổng số toàn viện theo từng đơn vị
// và theo loại không" — trước đây review_date được tính và lưu nhưng không
// ai đọc lại (CLAUDE.md nguyên tắc 5), và trang không có thống kê tổng số
// theo khoa/phòng hay loại văn bản nào cả. Thêm 2 việc: (1) nhắc quá hạn/sắp
// đến hạn xem xét lại, gấp vào đúng pipeline thông báo chung; (2) panel
// thống kê toàn viện theo khoa/phòng + theo loại ngay trên trang.
describe("Document publications: nhắc hạn xem xét lại + thống kê toàn viện theo khoa/phòng và loại", () => {
  it("syncDocumentPublicationReviewRemindersForUser tồn tại, chỉ dành cho document_publication.manage, chỉ xét văn bản PUBLISHED có review_date", () => {
    const shared = read("src/lib/notification-sync.ts");
    expect(shared).toContain("export async function syncDocumentPublicationReviewRemindersForUser(admin: AdminClient, userId: string) {");
    expect(shared).toContain('userHasPermission(admin, userId, "document_publication.manage")');
    expect(shared).toContain('.eq("stage", "PUBLISHED")');
    expect(shared).toContain('.not("review_date", "is", null)');
    expect(shared).toContain('onConflict: "recipient_user_id,notification_event_key"');
  });

  it("được gấp vào đủ cả 3 đường: route riêng, orchestrator (polling) và cron nền (không phụ thuộc ai mở app)", () => {
    const route = read("src/app/api/notifications/sync-document-publication-reviews/route.ts");
    expect(route).toContain("syncDocumentPublicationReviewRemindersForUser(admin, auth.user.id)");

    const orchestrator = read("src/lib/notification-orchestrator.ts");
    expect(orchestrator).toContain("syncDocumentPublicationReviewRemindersForUser");

    const cron = read("src/app/api/cron/sync-notifications/route.ts");
    expect(cron).toContain("syncDocumentPublicationReviewRemindersForUser(admin, userId)");
  });

  it("UI: panel \"Thống kê toàn viện\" tính tổng theo TẤT CẢ khoa/phòng đang hoạt động (kể cả khoa chưa có văn bản) và theo từng loại văn bản, từ toàn bộ documents (không chỉ Đã phát hành)", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("<h2>Thống kê toàn viện</h2>");
    expect(client).toContain("const statsByDepartment = departments");
    expect(client).toContain("const statsByType = DOCUMENT_TYPES.map((t) => ({ key: t, name: DOCUMENT_TYPE_LABEL[t], count: documents.filter((doc) => doc.document_type === t).length }));");
  });
});
