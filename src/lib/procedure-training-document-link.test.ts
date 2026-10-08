import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Khi phát hành văn bản với dissemination_type=TRAINING_REQUIRED, route đã tự
// tạo 1 dòng procedure_trainings kèm document_publication_id từ trước (xem
// document-publications/[id]/route.ts) — nhưng màn hình "Theo dõi quy trình
// đào tạo" chưa từng đọc/hiện cột đó, nên không ai biết 1 dòng đào tạo đến từ
// văn bản nào. document-publications chưa có trang chi tiết theo id nên chỉ
// liên kết về trang danh sách.
describe("Đào tạo quy trình hiện liên kết ngược tới văn bản đã phát hành nó", () => {
  it("trang procedure-trainings đọc document_publication_id và join sang document_publications để lấy tiêu đề/mã văn bản", () => {
    const page = read("src/app/(app)/procedure-trainings/page.tsx");
    expect(page).toContain("document_publication_id");
    expect(page).toContain('.from("document_publications").select("id,title,document_code")');
    expect(page).toContain("source_document: t.document_publication_id ? sourceDocMap.get(t.document_publication_id) || null : null");
  });

  it("UI hiện dòng 'Từ văn bản ...' kèm link khi training có nguồn gốc từ văn bản phát hành", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).toContain("source_document: { id: string; title: string; document_code: string | null } | null;");
    expect(client).toContain("Từ văn bản");
    expect(client).toContain('href="/document-publications"');
  });

  it("không tự dựng link tới 1 trang chi tiết văn bản chưa tồn tại — chỉ về trang danh sách", () => {
    const client = read("src/components/procedure-trainings-client.tsx");
    expect(client).not.toContain("/document-publications/${");
  });
});
