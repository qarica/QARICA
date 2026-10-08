import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện Thấp: "Bút phê GĐ" là text tự do, không ai biết ai ghi lúc nào.
// Không thêm cột director_note_by/director_note_at (cần migration) — đọc lại
// chính audit_logs đã ghi mỗi lần director_note đổi (route PATCH đã ghi từ
// trước) để suy ra ai/lúc nào, 1 nguồn dữ liệu duy nhất.
describe("'Bút phê GĐ' hiện được ai ghi và lúc nào, không cần migration", () => {
  it("trang server đọc audit_logs (INCOMING_DOCUMENT_UPDATE) tìm lần đổi director_note gần nhất", () => {
    const page = read("src/app/(app)/incoming-documents/page.tsx");
    expect(page).toContain('.eq("table_name", "incoming_documents")');
    expect(page).toContain('.eq("action_type", "INCOMING_DOCUMENT_UPDATE")');
    expect(page).toContain('"director_note" in log.new_value');
    expect(page).toContain("director_note_by: meta ? actorNameMap.get(meta.actorUserId) || null : null");
  });

  it("UI hiện dòng 'Bởi ... · ngày giờ' dưới nội dung bút phê khi có dữ liệu", () => {
    const client = read("src/components/incoming-documents-client.tsx");
    expect(client).toContain("director_note_by: string | null;");
    expect(client).toContain("Bởi {doc.director_note_by}");
  });

  it("các audit_logs.insert ở Công văn/Phát hành văn bản/Mua sắm giờ kiểm tra lỗi thay vì ghi âm thầm bỏ qua (tính năng Bút phê GĐ phụ thuộc audit_logs ghi thành công)", () => {
    const incomingPatch = read("src/app/api/incoming-documents/[id]/route.ts");
    expect(incomingPatch).toContain("const { error: auditError } = await admin.from(\"audit_logs\").insert({");
    expect(incomingPatch).toContain("if (auditError) return NextResponse.json({ error: `Đã lưu nhưng không ghi được audit trail");

    const incomingPost = read("src/app/api/incoming-documents/route.ts");
    expect(incomingPost).toContain("const { error: auditError } = await admin.from(\"audit_logs\").insert({");

    const docPubPost = read("src/app/api/document-publications/route.ts");
    expect(docPubPost).toContain("const { error: auditError } = await admin.from(\"audit_logs\").insert({");
    const docPubPatch = read("src/app/api/document-publications/[id]/route.ts");
    expect((docPubPatch.match(/const \{ error: auditError \} = await admin\.from\("audit_logs"\)\.insert\(\{/g) || []).length).toBe(2);

    const procPost = read("src/app/api/procurement/requests/route.ts");
    expect(procPost).toContain("const { error: auditError } = await admin.from(\"audit_logs\").insert({");
    const procPatch = read("src/app/api/procurement/requests/[id]/route.ts");
    expect(procPatch).toContain("const { error: auditError } = await admin.from(\"audit_logs\").insert({");
  });
});
