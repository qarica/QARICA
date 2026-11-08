import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "Phần kiểm soát tài liệu khi nhập thiếu lần phát hành để
// kiểm soát phiên bản đó" — document_publications.version_label là cột
// NOT NULL với default 'Dự thảo 01' trong DB, nhưng không nơi nào trong UI
// từng hỏi/ghi giá trị thật (chỉ có trong SELECT, chưa bao giờ xuất hiện
// trong insert/update payload) — mọi văn bản vì vậy luôn hiện đúng y chang
// default, không kiểm soát được phiên bản thật. Thêm ở 2 nơi version_label
// thật sự có ý nghĩa: Phát hành tại chỗ (ADVANCE -> PUBLISHED, dùng chung cho
// cả yêu cầu loại NEW/UPDATE — xem describe "Tạo yêu cầu" bên dưới) và Nhập
// văn bản đã phát hành (direct_publish). KHÔNG còn ở "Sửa" (EDIT) nữa — theo
// yêu cầu sau "cập nhật hay thu hồi hay viết mới đều phải qua đề nghị văn
// bản mới", EDIT đã bỏ hẳn khả năng đổi version_label tại chỗ.
describe("Document publications — version_label (Lần phát hành) bắt buộc khi phát hành", () => {
  it("POST direct_publish bắt buộc version_label, cùng mức với document_code/effective_date/dissemination_type", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('const versionLabel = String(body.version_label || "").trim();');
    expect(route).toContain('if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });');
    expect(route).toContain("insertPayload.version_label = versionLabel;");
  });

  it("PATCH ADVANCE sang PUBLISHED bắt buộc version_label (dùng chung cho cả yêu cầu NEW và UPDATE, chỉ RETRACT mới không cần)", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    const advanceBlock = route.slice(route.indexOf('} else if (upcoming === "PUBLISHED") {'), route.indexOf("if (disseminationType ==="));
    expect(advanceBlock).toContain('const versionLabel = String(body.version_label || "").trim();');
    expect(advanceBlock).toContain('if (!versionLabel) return NextResponse.json({ error: "Chưa nhập lần phát hành." }, { status: 400 });');
    expect(advanceBlock).toContain("version_label: versionLabel,");
  });

  // KHÔNG còn input "Lần phát hành" ở Sửa (EDIT) — chỉ còn 2 nơi: Phát hành
  // tại chỗ (dp-publish-form, dùng chung NEW/UPDATE) và Nhập văn bản đã phát
  // hành (direct_publish).
  it("client: có đúng 2 input 'Lần phát hành' — Phát hành tại chỗ, Nhập văn bản đã phát hành (không còn ở Sửa)", () => {
    const client = read("src/components/document-publications-client.tsx");
    const matches = client.match(/placeholder="Lần phát hành \(vd: Lần ban hành 01\)\.\.\."/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("client: cả 2 nút submit tương ứng đều disabled khi chưa nhập lần phát hành; nút Sửa chỉ còn đòi tên/đơn vị soạn thảo", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("disabled={!documentCode.trim() || !effectiveDate || !versionLabel.trim()}");
    expect(client).toContain(
      "disabled={directBusy || !directTitle.trim() || !directDraftingDepartmentId || !directDocumentCode.trim() || !directEffectiveDate || !directVersionLabel.trim()}"
    );
    expect(client).toContain("disabled={editBusy || !editTitle.trim() || !editDraftingDepartmentId}");
  });

  it("client: startEdit() KHÔNG còn nạp version_label/document_code/effective_date (đã bỏ khỏi form Sửa)", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).not.toContain("setEditVersionLabel");
    expect(client).not.toContain("setEditDocumentCode");
    expect(client).not.toContain("setEditEffectiveDate");
  });

  it("client: cả 3 nơi reset lại state version_label về mặc định '01' (không phải rỗng) sau khi submit/mở form mới, không giữ giá trị cũ sang văn bản khác", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('setDirectVersionLabel("01");');
    const advanceFn = client.slice(client.indexOf("async function advance("), client.indexOf("async function removeDocument"));
    expect(advanceFn).toContain('setVersionLabel("01");');
    const startPublishFn = client.slice(client.indexOf("function startPublish("), client.indexOf("function toggleFolder"));
    expect(startPublishFn).toContain('setVersionLabel("01");');
  });

  it("client: state versionLabel/directVersionLabel khởi tạo sẵn '01' nhưng vẫn là input chỉnh sửa được (không readOnly/disabled)", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('const [versionLabel, setVersionLabel] = useState("01");');
    expect(client).toContain('const [directVersionLabel, setDirectVersionLabel] = useState("01");');
    expect(client).not.toMatch(/placeholder="Lần phát hành \(vd: Lần ban hành 01\)\.\.\."[^>]*readOnly/);
  });
});

// Báo cáo thực tế tiếp theo: "thư viện cần có 1 cột là phiên bản để biết" —
// version_label giờ đã nhập được (xem describe phía trên) nhưng Thư viện
// văn bản (danh sách Đã phát hành) lại không có cột nào hiển thị nó, phải
// bấm Sửa từng văn bản mới thấy. Thêm cột "Phiên bản" vào cả bảng chính và
// Xuất Excel — cùng loại lệch nhất quán UI↔export CLAUDE.md yêu cầu đối
// chiếu đã gặp ở EMR (emr-export-hides-hidefromgrid-fields.test.ts).
describe("Document publications — Thư viện văn bản có cột Phiên bản", () => {
  const client = read("src/components/document-publications-client.tsx");

  it("bảng Thư viện văn bản có cột 'Phiên bản' ngay sau 'Tên văn bản', hiển thị version_label", () => {
    expect(client).toContain("<th>Mã văn bản</th>\n                        <th>Tên văn bản</th>\n                        <th>Phiên bản</th>\n                        <th>Loại</th>");
    expect(client).toContain('<td>{d.document_code || "—"}</td>\n                              <td>{d.title}</td>\n                              <td>{d.version_label}</td>\n                              <td>{DOCUMENT_TYPE_LABEL[d.document_type]}</td>');
  });

  it("colSpan của dòng form Sửa luôn là 9 (cột Thao tác giờ luôn hiện vì có nút Lịch sử cho mọi người xem được, không chỉ canManage)", () => {
    expect(client).toContain("<td colSpan={9}>");
  });

  it("Xuất Excel cũng có cột 'Phiên bản', khớp với bảng chính", () => {
    expect(client).toContain('const header = ["Mã văn bản", "Tên văn bản", "Phiên bản", "Loại", "Khoa/phòng soạn thảo", "Bước", "Ngày hiệu lực", "Ngày xem xét lại", "Trạng thái rà soát", "Phổ biến"];');
    expect(client).toContain('d.document_code || "",\n          d.title,\n          d.version_label,\n          DOCUMENT_TYPE_LABEL[d.document_type],');
  });
});

// Báo cáo thực tế: "Sắp xếp lại thứ tự các trường nhập văn bản đã phát hành
// như sau: mã, tên, ngày, lần phát hành... cho dễ nhập. Còn chỗ đơn vị thì
// không nên để mặc định ban giám đốc dễ chọn nhầm" — form "Nhập văn bản đã
// phát hành" (direct_publish) có thứ tự input lộn xộn (mã+ngày, rồi lần phát
// hành, rồi tên) khác với luồng đọc tự nhiên mã->tên->ngày->lần phát hành.
// Đồng thời cả 2 select "khoa/phòng soạn thảo" (đề nghị văn bản mới lẫn nhập
// văn bản đã phát hành) tự chọn sẵn departments[0] — do danh sách khoa/phòng
// được sắp theo tên (order("name")) nên "Ban Giám đốc" luôn đứng đầu, khiến
// người dùng vô tình gửi/phát hành nhầm đơn vị nếu quên đổi lại.
describe("Document publications — thứ tự trường nhập + không mặc định khoa/phòng", () => {
  const client = read("src/components/document-publications-client.tsx");

  it("form Nhập văn bản đã phát hành có thứ tự mã -> tên -> ngày -> lần phát hành", () => {
    const codeIdx = client.indexOf('placeholder="Mã văn bản..." value={directDocumentCode}');
    const titleIdx = client.indexOf('placeholder="Tên văn bản..." value={directTitle}');
    const dateIdx = client.indexOf("type=\"date\" value={directEffectiveDate}");
    const versionIdx = client.indexOf('placeholder="Lần phát hành (vd: Lần ban hành 01)..." value={directVersionLabel}');
    expect(codeIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeGreaterThan(codeIdx);
    expect(dateIdx).toBeGreaterThan(titleIdx);
    expect(versionIdx).toBeGreaterThan(dateIdx);
  });

  it("không còn useState(departments[0]?.id || \"\") cho khoa/phòng soạn thảo ở bất kỳ form nào", () => {
    expect(client).not.toContain("useState(departments[0]?.id");
    expect(client).toContain('const [draftingDepartmentId, setDraftingDepartmentId] = useState("");');
    expect(client).toContain('const [directDraftingDepartmentId, setDirectDraftingDepartmentId] = useState("");');
  });

  it("cả 2 select khoa/phòng soạn thảo (đề nghị + nhập văn bản đã phát hành) đều có option rỗng bắt chọn tay", () => {
    const matches = client.match(/<option value="">\{departments\.length \? "- Chọn khoa\/phòng soạn thảo -" : "- Chưa có khoa\/phòng nào -"\}<\/option>/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

// Báo cáo thực tế: hỏi "có nên tách Đề nghị văn bản mới / Nhập văn bản đã
// phát hành thành 2 menu con" -> quyết định KHÔNG tách (giữ 1 trang, tránh
// rời rạc ngữ cảnh), thay vào đó thu gọn "Đề nghị văn bản mới" mặc định ở cả
// desktop (trước đây chỉ thu gọn trên mobile, desktop luôn mở sẵn) để trang
// đỡ dài — dùng class riêng dp-request-toggle/dp-request-form (không đụng
// vào mobile-form-toggle/mobile-collapsible-form dùng chung cho các form
// khác như "Nhập văn bản đã phát hành"/"Thống kê toàn viện" trên cùng trang
// và các trang procurement/pt-overview khác).
describe("Document publications — thu gọn 'Đề nghị văn bản mới' mặc định ở cả desktop", () => {
  const client = read("src/components/document-publications-client.tsx");
  const css = read("src/app/final-visual-lock.css");

  it("nút toggle + form 'Đề nghị văn bản mới' có thêm class riêng dp-request-toggle/dp-request-form", () => {
    expect(client).toContain('className="button secondary mobile-form-toggle dp-request-toggle"');
    expect(client).toContain('mobileFormOpen ? "dp-form mobile-collapsible-form dp-request-form is-open" : "dp-form mobile-collapsible-form dp-request-form"');
  });

  it("CSS thu gọn dp-request-form ở desktop (min-width:761px), không đụng mobile-form-toggle dùng chung", () => {
    const block = css.slice(css.indexOf("thu gọn mặc định ở cả desktop"), css.indexOf("thu gọn mặc định ở cả desktop") + 500);
    expect(block).toContain(".document-publications-overview .dp-request-toggle{display:flex!important");
    expect(block).toContain(".document-publications-overview .dp-request-form:not(.is-open){display:none!important}");
    expect(block).toContain(".document-publications-overview .dp-request-form.is-open{display:grid!important}");
  });

  it("mobileFormOpen vẫn khởi tạo false — thu gọn là mặc định, không phải mở sẵn", () => {
    expect(client).toContain('const [mobileFormOpen, setMobileFormOpen] = useState(false);');
  });
});

// Báo cáo thực tế: "Phần dashboard hiện chỉ có 3 hình là tổng văn bản, đang
// xử lý và đã ban hành. Còn thiếu Cần rà soát" — thêm KPI thứ 4 ngay trong
// trang Kiểm soát tài liệu (không phải Dashboard tổng, đã có cảnh báo riêng
// ở đó — xem dashboard-document-review-alert.test.ts), cùng ngưỡng "Quá hạn
// rà soát" với badge trong Thư viện văn bản. Không đổi rule CSS chung
// .mobile-workflow-kpis (dùng chung với emr-bieu-mau-groups/procedure-
// trainings/procurement-requests, đều chỉ có 3 KPI) — override riêng bằng
// class .dp-kpis.
describe("Document publications — KPI thứ 4 'Cần rà soát'", () => {
  const client = read("src/components/document-publications-client.tsx");
  const css = read("src/app/final-visual-lock.css");

  it("thêm KPI 'Cần rà soát' đếm đúng ngưỡng quá hạn review_date (cùng luật reviewStatus), dựa trên published chứ không phải documents thô", () => {
    expect(client).toContain(
      'const needsReviewCount = published.filter((d) => d.review_date && d.review_date.slice(0, 10) < today).length;',
    );
    expect(client).toContain("<small>Cần rà soát</small>");
    expect(client).toContain("<strong>{needsReviewCount}</strong>");
  });

  it("wrapper KPI có thêm class dp-kpis (4 cột), không sửa rule .mobile-workflow-kpis dùng chung 3 module khác", () => {
    expect(client).toContain('<div className="mobile-workflow-kpis dp-kpis">');
    expect(css).toContain(".document-publications-overview .dp-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}");
    expect(css).toContain(".mobile-module-redesign .mobile-workflow-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}");
  });

  it("mobile (<=760px) xếp dp-kpis thành 2 cột thay vì 4 cột chật", () => {
    expect(css).toContain("@media(max-width:760px){.document-publications-overview .dp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}");
  });
});

// Báo cáo thực tế: "Quản lý văn bản khi 1 văn bản update phiên bản mới thì
// làm sao e" -> "Khi phát hành phiên bản mới phải có lịch sử chứ" — trước
// đây version_label chỉ là 1 field bị GHI ĐÈ mỗi lần phát hành (lần đầu
// ADVANCE→PUBLISHED/direct_publish) hoặc phát hành lại (EDIT khi đã
// PUBLISHED) — phiên bản cũ biến mất khỏi UI, chỉ còn trong audit_logs
// (không phải nơi người dùng tra cứu). Thêm bảng append-only
// document_publication_versions, ghi 1 dòng mỗi lần version_label được chốt
// ở ĐỦ CẢ 3 nơi (không riêng EDIT) — recordDocumentVersion() dùng chung.
describe("Document publications — lịch sử phiên bản (document_publication_versions, append-only)", () => {
  it("migration tạo bảng append-only, không có cột update_at/trigger sửa tại chỗ — tenant-scoped qua organization_id + RLS select theo tổ chức", () => {
    const migration = read("supabase/migrations/20261124000000_document_publication_version_history_v1.sql");
    expect(migration).toContain("create table if not exists public.document_publication_versions");
    expect(migration).toContain("document_publication_id uuid not null references public.document_publications(id) on delete cascade");
    expect(migration).toContain("organization_id = (select organization_id from public.profiles where user_id = auth.uid())");
  });

  it("recordDocumentVersion() là helper dùng chung, insert 1 dòng mới (không update/upsert đè lên dòng cũ)", () => {
    const server = read("src/lib/document-publication-server.ts");
    expect(server).toContain("export async function recordDocumentVersion(");
    expect(server).toContain('admin.from("document_publication_versions").insert({');
  });

  // Sau yêu cầu "cập nhật hay thu hồi hay viết mới đều phải qua đề nghị văn
  // bản mới", handleEdit (Sửa) không còn gọi recordDocumentVersion() nữa —
  // chỉ còn 2 nơi version_label thật sự được chốt: POST direct_publish, và
  // PATCH ADVANCE→PUBLISHED (dùng CHUNG đúng 1 lệnh gọi cho cả yêu cầu loại
  // NEW lẫn UPDATE — xem targetId trong PATCH route, ghi version cho target
  // khi là UPDATE, ghi cho chính nó khi là NEW).
  it("recordDocumentVersion() chỉ còn gọi ở POST direct_publish và PATCH ADVANCE→PUBLISHED — KHÔNG còn ở Sửa (EDIT)", () => {
    const listRoute = read("src/app/api/document-publications/route.ts");
    expect(listRoute).toContain("recordDocumentVersion(admin, {");
    const itemRoute = read("src/app/api/document-publications/[id]/route.ts");
    const occurrences = (itemRoute.match(/recordDocumentVersion\(admin, \{/g) ?? []).length;
    expect(occurrences).toBe(1); // chỉ còn trong ADVANCE→PUBLISHED, dùng chung NEW/UPDATE qua targetId
    const editFn = itemRoute.slice(itemRoute.indexOf("async function handleEdit("), itemRoute.indexOf("export async function PATCH("));
    expect(editFn).not.toContain("recordDocumentVersion(");
  });

  it("route GET lịch sử phiên bản chỉ cần .view (xem, không phải thao tác kiểm soát), luôn chặn theo organization_id của văn bản trước khi trả dữ liệu", () => {
    const route = read("src/app/api/document-publications/[id]/versions/route.ts");
    expect(route).toContain('requireApiPermission("document_publication.view")');
    expect(route).not.toContain('requireApiPermission("document_publication.manage")');
    expect(route).toContain('.eq("organization_id", organizationId)');
    expect(route).toContain('if (!document) return NextResponse.json({ error: "Không tìm thấy văn bản." }, { status: 404 });');
  });

  it("UI: cột Thao tác giờ luôn hiện (không chỉ canManage) vì nút Lịch sử là xem, không phải quản lý — nút Sửa vẫn chỉ canManage mới thấy", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("<th>Thao tác</th>");
    expect(client).not.toContain("{canManage ? <th>Thao tác</th> : null}");
    expect(client).toContain("{canManage && editingId !== d.id ? (");
    expect(client).toContain("async function toggleHistory(doc: DocumentPublication) {");
    expect(client).toContain("disabled={historyBusy === d.id} onClick={() => void toggleHistory(d)}");
  });

  it("UI: bấm Lịch sử tải GET .../versions, cache theo id (không gọi lại API nếu đã có), hiện người phát hành qua staffNameById (không lộ user_id trần)", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("fetch(`/api/document-publications/${doc.id}/versions`)");
    expect(client).toContain("if (versionHistory[doc.id]) return;");
    expect(client).toContain("const staffNameById = useMemo(() => new Map(staffRoster.map((s) => [s.id, s.name])), [staffRoster]);");
    expect(client).toContain("{staffNameById.get(v.created_by) || \"—\"}");
  });
});
