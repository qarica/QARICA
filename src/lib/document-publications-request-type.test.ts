import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Báo cáo thực tế: "Chưa hiểu cách thao tác" -> "Nếu a muốn cập nhật hay thu
// hồi hay viết mới đều phải qua đề nghị văn bản mới. Có thể đổi thành Tạo
// yêu cầu" -> đối chiếu với TA2.QLCL.QT.06 (quy trình kiểm soát tài liệu
// thật, lưu đồ 4.2/4.4/4.5): bước đầu tiên luôn là "Đề nghị viết mới/ sửa
// đổi/ thu hồi tài liệu" — đúng 3 loại yêu cầu, qua 1 cổng duyệt chung rồi
// rẽ nhánh. Viết mới/sửa đổi đi đủ chuỗi soạn thảo->góp ý->rà soát->phê
// duyệt->trình ký->phát hành; thu hồi chỉ qua đúng bước duyệt đầu rồi thực
// hiện ngay — KHÔNG qua soạn thảo/góp ý/rà soát/phê duyệt. document_publications
// giờ có request_type (NEW/UPDATE/RETRACT) + target_document_id (văn bản ĐÃ
// PUBLISHED mà yêu cầu UPDATE/RETRACT nhắm tới).
describe("Document publications — Tạo yêu cầu (NEW/UPDATE/RETRACT), đối chiếu QT.06 thật", () => {
  it("migration thêm request_type/target_document_id/retracted_at + RETRACTED vào constraint stage, không đụng cột/constraint khác", () => {
    const migration = read("supabase/migrations/20261125000000_document_publication_request_type_v1.sql");
    expect(migration).toContain("add column if not exists request_type text not null default 'NEW' check (request_type in ('NEW','UPDATE','RETRACT'))");
    expect(migration).toContain("add column if not exists target_document_id uuid references public.document_publications(id)");
    expect(migration).toContain("add column if not exists retracted_at timestamptz");
    expect(migration).toContain("check (stage = any (array['REQUESTED','DRAFTING','COLLECTING_FEEDBACK','REVISING','APPROVING','PUBLISHED','RETRACTED']));");
  });

  it("POST: direct_publish luôn ép request_type=NEW (không áp dụng khái niệm cập nhật/thu hồi cho văn bản nhập trực tiếp lần đầu)", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('const requestType = directPublish ? "NEW" : body.request_type ?? "NEW";');
  });

  it("POST: UPDATE/RETRACT bắt buộc target_document_id trỏ đúng 1 văn bản ĐANG PUBLISHED (request_type=NEW, chưa bị thu hồi), cùng tổ chức", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('if (!targetDocumentId) return NextResponse.json({ error: "Chưa chọn văn bản cần cập nhật/thu hồi." }, { status: 400 });');
    expect(route).toContain('if (!target || target.stage !== "PUBLISHED" || target.request_type !== "NEW") {');
  });

  it("POST: chặn tạo 2 yêu cầu UPDATE/RETRACT cùng nhắm 1 văn bản khi yêu cầu trước chưa xử lý xong (tránh xung đột)", () => {
    const route = read("src/app/api/document-publications/route.ts");
    expect(route).toContain('.eq("target_document_id", targetDocumentId)');
    expect(route).toContain('.neq("stage", "PUBLISHED")');
    expect(route).toContain('if (pending && pending.length) return NextResponse.json({ error: "Văn bản này đang có 1 yêu cầu cập nhật/thu hồi khác chưa xử lý xong." }, { status: 400 });');
  });

  it("nextStage(): RETRACT nhảy thẳng REQUESTED→PUBLISHED (chỉ 1 cổng duyệt, khớp lưu đồ QT.06 thật — không có bước soạn thảo/góp ý/rà soát/phê duyệt cho thu hồi)", () => {
    const types = read("src/lib/document-publication-types.ts");
    expect(types).toContain('if (requestType === "RETRACT" && stage === "REQUESTED") return "PUBLISHED";');
  });

  it("PATCH ADVANCE: nextStage() được gọi với requestType (không chỉ current.stage) để RETRACT rẽ nhánh rút gọn đúng", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('const requestType = (current.request_type || "NEW") as DocumentPublicationRequestType;');
    expect(route).toContain("const upcoming = nextStage(current.stage, requestType);");
  });

  it("PATCH ADVANCE: khi upcoming=PUBLISHED và requestType=RETRACT, KHÔNG đòi mã/ngày/phổ biến/phiên bản — chỉ chuyển target sang RETRACTED, đặt retracted_at, xoá review_date (ngưng nhắc rà soát)", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    const retractBlock = route.slice(route.indexOf('if (upcoming === "PUBLISHED" && requestType === "RETRACT")'), route.indexOf('} else if (upcoming === "PUBLISHED") {'));
    expect(retractBlock).toContain('if (!current.target_document_id) return NextResponse.json({ error: "Yêu cầu thu hồi thiếu văn bản đích." }, { status: 400 });');
    expect(retractBlock).toContain('.update({ stage: "RETRACTED", retracted_at: new Date().toISOString(), current_owner_label: null, review_date: null, updated_at: new Date().toISOString() })');
    expect(retractBlock).toContain(".eq(\"id\", current.target_document_id)");
  });

  it("PATCH ADVANCE: requestType=UPDATE áp document_code/effective_date/review_date/dissemination_type/version_label (và title/loại/đơn vị soạn thảo) lên target_document_id, KHÔNG lên chính yêu cầu", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain('const targetId = requestType === "UPDATE" ? current.target_document_id : id;');
    expect(route).toContain("targetUpdate.title = current.title;");
    expect(route).toContain("targetUpdate.document_type = documentType;");
    expect(route).toContain("targetUpdate.drafting_department_id = current.drafting_department_id;");
    expect(route).toContain('const { error: targetError } = await admin.from("document_publications").update(targetUpdate).eq("id", targetId).eq("organization_id", organizationId);');
  });

  it("PATCH ADVANCE: recordDocumentVersion() ghi vào targetId (target khi UPDATE, chính nó khi NEW) — version history luôn gắn đúng văn bản thật đang hiển thị", () => {
    const route = read("src/app/api/document-publications/[id]/route.ts");
    expect(route).toContain("documentPublicationId: targetId!,");
  });

  it("UI: section đổi tên 'Đề nghị văn bản mới' -> 'Tạo yêu cầu', có select Loại yêu cầu (REQUEST_TYPES) và select văn bản đích khi khác NEW", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("Tạo yêu cầu</h2>");
    expect(client).not.toContain("Đề nghị văn bản mới</h2>");
    expect(client).toContain('value={requestType} onChange={(e) => selectRequestType(e.target.value as DocumentPublicationRequestType)}');
    expect(client).toContain('{requestType !== "NEW" ? (');
    expect(client).toContain('value={targetDocumentId} onChange={(e) => selectTarget(e.target.value)}');
  });

  it("UI: selectTarget() tự nạp title/document_type/drafting_department_id từ văn bản đích đã chọn (đỡ gõ lại, vẫn sửa được)", () => {
    const client = read("src/components/document-publications-client.tsx");
    const fn = client.slice(client.indexOf("function selectTarget("), client.indexOf("function selectRequestType("));
    expect(fn).toContain("setTitle(target.title);");
    expect(fn).toContain("setDocumentType(target.document_type);");
    expect(fn).toContain("setDraftingDepartmentId(target.drafting_department_id || \"\");");
  });

  it("UI: submit() chặn gửi khi UPDATE/RETRACT mà chưa chọn target_document_id, gửi đúng request_type/target_document_id lên API", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('if (requestType !== "NEW" && !targetDocumentId) {');
    expect(client).toContain("request_type: requestType,");
    expect(client).toContain('target_document_id: requestType === "NEW" ? null : targetDocumentId,');
  });

  it("UI: Thư viện văn bản/Đang xử lý/Tài liệu hết hiệu lực lọc đúng theo stage+request_type — yêu cầu UPDATE/RETRACT đã PUBLISHED (đã xử lý xong) KHÔNG lẫn vào Thư viện văn bản như văn bản thật", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('.filter((d) => d.stage === "PUBLISHED" && d.request_type === "NEW")');
    expect(client).toContain('.filter((d) => d.stage !== "PUBLISHED" && d.stage !== "RETRACTED")');
    expect(client).toContain('.filter((d) => d.stage === "RETRACTED")');
  });

  it("UI: có section 'Tài liệu hết hiệu lực' hiện danh sách văn bản stage=RETRACTED (không xoá dữ liệu, chỉ đổi màn hình hiển thị, đúng yêu cầu 'phải có 1 chổ để lưu')", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("Tài liệu hết hiệu lực</h2>");
    expect(client).toContain("{retracted.map((d) => (");
  });

  it("UI: Thu hồi KHÔNG qua form 'Phát hành' (startPublish/publishingId, đòi mã/ngày/phổ biến/phiên bản) — chỉ 1 nút xác nhận gọi advance() thẳng, khớp QT.06 (thu hồi chỉ qua 1 bước duyệt)", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain("async function confirmRetract(doc: DocumentPublication) {");
    expect(client).toContain("if (!window.confirm(");
    expect(client).toContain("await advance(doc);");
    expect(client).toContain('{d.request_type === "RETRACT" ? (');
    expect(client).toContain("onClick={() => void confirmRetract(d)}");
  });

  it("UI: badge loại yêu cầu + văn bản đích hiện trong 'Đang xử lý' khi request_type khác NEW, giúp người duyệt biết yêu cầu này là gì", () => {
    const client = read("src/components/document-publications-client.tsx");
    expect(client).toContain('{d.request_type !== "NEW" ? <span className={`status-badge ${d.request_type === "RETRACT" ? "danger" : "warning"}`}>{REQUEST_TYPE_LABEL[d.request_type]}</span> : null}');
    expect(client).toContain("Văn bản đích: {documentById.get(d.target_document_id)?.title || \"—\"}");
  });
});
