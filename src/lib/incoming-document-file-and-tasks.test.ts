import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi thực tế: ban đầu tham khảo luồng "AI tự đọc & điền" từ một app
// ngoài, nhưng người dùng quyết định KHÔNG cần AI (chưa có API key, không
// muốn xử lý việc đó) — bỏ hẳn route /api/incoming-documents/extract và thư
// viện gọi AI. Giữ lại 2 phần không phụ thuộc AI vẫn hữu ích độc lập: đính
// kèm file gốc (PDF/DOCX) vào công văn, và "Tạo công việc từ văn bản" với
// Chủ trì (bắt buộc) + Phối hợp (không bắt buộc).
describe("Không còn tính năng AI đọc công văn", () => {
  it("đã xoá route /api/incoming-documents/extract và thư viện gọi AI", () => {
    expect(() => read("src/app/api/incoming-documents/extract/route.ts")).toThrow();
    expect(() => read("src/lib/incoming-document-ai-extract.ts")).toThrow();
  });

  it("package.json không còn phụ thuộc mammoth (chỉ dùng để trích chữ DOCX cho AI đọc)", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies?.mammoth).toBeUndefined();
    expect(pkg.devDependencies?.mammoth).toBeUndefined();
  });

  it("UI không còn nút 'Đọc và điền thông tin' hay nhắc tới AI", () => {
    const client = read("src/components/incoming-documents-client.tsx");
    expect(client).not.toContain("Đọc và điền thông tin");
    expect(client).not.toContain("/api/incoming-documents/extract");
    expect(client).not.toContain("extractFromFile");
  });
});

describe("Migration: file_path/file_name cho incoming_documents + bảng incoming_document_tasks", () => {
  const migration = read("supabase/migrations/20261025090000_incoming_document_ai_intake_v1.sql");

  it("thêm file_path/file_name vào incoming_documents (cộng thêm, không đổi cột cũ)", () => {
    expect(migration).toContain("add column if not exists file_path text");
    expect(migration).toContain("add column if not exists file_name text");
  });

  it("tạo bảng incoming_document_tasks: 1 chủ trì bắt buộc + nhiều phối hợp không bắt buộc", () => {
    expect(migration).toContain("create table if not exists public.incoming_document_tasks");
    expect(migration).toContain("lead_user_id uuid not null");
    expect(migration).toContain("collaborating_user_ids uuid[] not null default '{}'::uuid[]");
    expect(migration).toContain("incoming_document_id uuid not null references public.incoming_documents(id) on delete cascade");
  });

  it("bật RLS, giới hạn đọc theo đúng tổ chức của người dùng", () => {
    expect(migration).toContain("alter table public.incoming_document_tasks enable row level security");
    expect(migration).toContain("organization_id = (select profiles.organization_id from public.profiles where profiles.user_id = (select auth.uid()))");
  });
});

describe("API /api/incoming-documents/[id]/file — đính kèm theo đúng quy ước document_publications", () => {
  const route = read("src/app/api/incoming-documents/[id]/file/route.ts");

  it("dùng chung bucket qlcl-evidence và evidenceFilePolicy để lọc loại file", () => {
    expect(route).toContain('const BUCKET = "qlcl-evidence"');
    expect(route).toContain("evidenceFilePolicy(originalFileName)");
  });

  it("POST ghi audit_logs, GET cấp signed URL ngắn hạn, DELETE xoá cả file lẫn cột tham chiếu", () => {
    expect(route).toContain("INCOMING_DOCUMENT_FILE_UPLOAD");
    expect(route).toContain("createSignedUrl(doc.file_path, 60)");
    expect(route).toContain("INCOMING_DOCUMENT_FILE_REMOVE");
  });
});

describe("API /api/incoming-documents/[id]/tasks — Chủ trì bắt buộc, Phối hợp không bắt buộc", () => {
  const collectionRoute = read("src/app/api/incoming-documents/[id]/tasks/route.ts");
  const itemRoute = read("src/app/api/incoming-documents/[id]/tasks/[taskId]/route.ts");

  it("POST bắt buộc title + lead_user_id, xác nhận chủ trì/phối hợp thuộc đúng tổ chức và đang hoạt động", () => {
    expect(collectionRoute).toContain('if (!leadUserId) return NextResponse.json({ error: "Chủ trì là bắt buộc." }');
    expect(collectionRoute).toContain('.eq("organization_id", organizationId)');
    expect(collectionRoute).toContain('.eq("is_active", true)');
  });

  it("loại chủ trì ra khỏi danh sách phối hợp để tránh trùng vai trò", () => {
    expect(collectionRoute).toContain(".filter((v) => v !== leadUserId)");
  });

  it("PATCH cho phép đổi chủ trì/phối hợp và đánh dấu hoàn thành, DELETE ghi audit_logs", () => {
    expect(itemRoute).toContain("INCOMING_DOCUMENT_TASK_UPDATE");
    expect(itemRoute).toContain("completed_at");
    expect(itemRoute).toContain("INCOMING_DOCUMENT_TASK_DELETE");
  });
});

describe("UI incoming-documents-client.tsx: đính kèm file thường + tạo công việc chủ trì/phối hợp", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("có ô chọn file gốc (không bắt buộc), tự đính kèm vào công văn vừa tạo", () => {
    expect(client).toContain("Đính kèm file gốc (PDF/DOCX, không bắt buộc)");
    expect(client).toContain("`/api/incoming-documents/${created.id}/file`");
  });

  it("mỗi dòng công văn có nút mở bảng công việc và form giao việc với Chủ trì (bắt buộc) + Phối hợp", () => {
    expect(client).toContain("toggleTaskPanel(doc.id)");
    expect(client).toContain("Chủ trì *");
    expect(client).toContain("Phối hợp (không bắt buộc)");
    expect(client).toContain("AssignmentTargetSelect");
    expect(client).toContain("AssignmentTargetsMultiSelect");
  });
});
