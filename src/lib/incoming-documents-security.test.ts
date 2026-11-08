import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Tiếp nhận công văn đến (Tổ Đề xuất): modeled off the real tracking sheet
// (intake + a single GĐ routing annotation + deployment + deadline +
// completion tracking) — explicitly NOT the procurement BGĐ/TGĐ approve-
// reject chain, which doesn't match how công văn is actually processed.
describe("Incoming documents module security and control gates", () => {
  it("separates view and manage permissions at API boundaries", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.view")');
    expect(read("src/app/api/incoming-documents/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('requireApiPermission("incoming_documents.manage")');
  });

  it("is reachable from the sidebar only behind incoming_documents.view", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('{ label: "QUẢN LÝ CÔNG VĂN", href: "/incoming-documents", icon: "file-input", permission: "incoming_documents.view" }');
  });

  it("keeps every write tenant-scoped by organization_id", () => {
    expect(read("src/app/api/incoming-documents/route.ts")).toContain("organization_id: organizationId");
    expect(read("src/app/api/incoming-documents/[id]/route.ts")).toContain('.eq("organization_id", organizationId)');
  });

  it("is its own table — not a procurement_requests approval-chain discriminator", () => {
    const migration = read("supabase/migrations/20261016_incoming_documents_v1.sql");
    expect(migration).toContain("create table if not exists public.incoming_documents");
    expect(migration).not.toContain("procurement_requests");
    expect(migration).not.toContain("BGD_APPROVE");
  });
});

describe("Incoming document status is computed, not manually typed", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("derives Hoàn thành đúng hạn / trễ hạn from completed_at vs due_date", () => {
    expect(client).toContain("if (doc.completed_at) {");
    expect(client).toContain('if (doc.due_date && doc.completed_at > doc.due_date) return { label: "Hoàn thành trễ hạn"');
    expect(client).toContain('return { label: "Hoàn thành đúng hạn"');
  });

  it("flags an unfinished document past its due_date as Trễ hạn, otherwise Đang xử lý", () => {
    expect(client).toContain('if (doc.due_date && doc.due_date < now) return { label: "Trễ hạn"');
    expect(client).toContain('return { label: "Đang xử lý"');
  });
});

// Báo cáo thực tế (ảnh chụp điện thoại): "2 trường nhập thời gian ko rõ là
// thời gian cho cái gì" — form "Tiếp nhận công văn mới" có 2 input
// type="date" trần (Ngày đến, Hạn xử lý) không nhãn hiển thị nào — input
// date không hiện được placeholder khi rỗng, và title chỉ là tooltip hover
// (vô dụng trên di động), nên cả 2 ô ngày trông giống hệt nhau, không biết
// ô nào là ngày gì. Bọc cả 2 trong <label className="doc-task-field"> có
// <span> nhãn phía trên, đúng quy ước label>span chung của app.
describe("Form Tiếp nhận công văn mới — 2 ô ngày có nhãn hiển thị rõ ràng", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("ô Ngày đến (receivedAt) có nhãn hiển thị 'Ngày đến', không chỉ còn là input date trần", () => {
    expect(client).toContain('<label className="doc-task-field">\n                <span>Ngày đến</span>\n                <input className="input" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />\n              </label>');
  });

  it("ô Hạn xử lý (dueDate) có nhãn hiển thị, không chỉ dựa vào title (tooltip hover, vô dụng trên di động)", () => {
    expect(client).toContain('<label className="doc-task-field">\n                <span>Hạn xử lý (tùy chọn)</span>\n                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />\n              </label>');
    expect(client).not.toContain('type="date" title="Hạn xử lý (tùy chọn)"');
  });
});

// Báo cáo thực tế: "Các loại công văn nên có list chọn: Công văn hướng dẫn,
// Công văn chỉ đạo, Công văn đôn đốc; Công văn đề nghị, yêu cầu, Công văn
// phúc đáp, Công văn giải trình, Công văn thông báo, Khác" — trước đây
// document_type là input gõ tay tự do (mỗi người ghi một kiểu, không nhất
// quán). Đổi thành select cố định đúng 8 loại người dùng liệt kê.
describe("Loại công văn (document_type) là list chọn cố định, không còn gõ tay tự do", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("định nghĩa đúng 8 loại công văn theo đúng thứ tự người dùng liệt kê, kết thúc bằng 'Khác'", () => {
    expect(client).toContain(
      'const INCOMING_DOCUMENT_TYPES = [\n  "Công văn hướng dẫn",\n  "Công văn chỉ đạo",\n  "Công văn đôn đốc",\n  "Công văn đề nghị, yêu cầu",\n  "Công văn phúc đáp",\n  "Công văn giải trình",\n  "Công văn thông báo",\n  "Khác",\n] as const;',
    );
  });

  it("form Tiếp nhận công văn mới dùng select (không còn input gõ tay) cho Loại công văn, có option rỗng để vẫn là tùy chọn", () => {
    expect(client).not.toContain('placeholder="Loại công văn (tùy chọn)"');
    expect(client).toContain('<select className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>');
    expect(client).toContain('<option value="">— Chọn loại công văn (tùy chọn) —</option>');
    expect(client).toContain('{INCOMING_DOCUMENT_TYPES.map((t) => (');
  });
});

// Báo cáo thực tế: "Bảng theo dõi công văn nên chia thành 1 cột đính kèm
// riêng kế bên trích yếu" — trước đây nút file đính kèm nằm lồng bên trong
// ô Trích yếu (dưới nội dung trích yếu), không có cột riêng. Tách thành
// cột "Đính kèm" độc lập, ngay sau cột Trích yếu — bảng có thêm 1 cột nên
// mọi colSpan dùng để gộp hàng (task panel mở rộng, "Chưa có công văn
// nào") phải cộng thêm 1 theo đúng tổng số cột mới.
describe("Bảng theo dõi công văn — cột Đính kèm tách riêng, ngay sau cột Trích yếu", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("có đúng <th>Đính kèm</th> ngay sau <th>Trích yếu</th>, Trích yếu không còn lồng nút file bên trong", () => {
    expect(client).toContain("<th>Ngày đến</th>\n                <th>Trích yếu</th>\n                <th>Đính kèm</th>\n                <th>Cơ quan</th>");
    expect(client).toContain('<td data-label="Trích yếu">{doc.summary}</td>');
  });

  it("ô Đính kèm hiện nút xem file khi có file, '—' khi không có", () => {
    expect(client).toContain('<td data-label="Đính kèm">');
    expect(client).toContain('<button type="button" className="doc-file-link" onClick={() => void viewFile(doc)}>📎 {doc.file_name}</button>');
  });

  it("colSpan gộp hàng (task panel, empty-state) cộng thêm 1 cho cột Đính kèm mới, không lệch bảng", () => {
    expect(client).toContain('<td colSpan={canManage ? 10 : 9} className="doc-task-panel-cell">');
    expect(client).toContain('<td colSpan={canManage ? 10 : 9} className="empty-state compact">');
    expect(client).not.toContain("colSpan={canManage ? 9 : 8}");
  });
});
