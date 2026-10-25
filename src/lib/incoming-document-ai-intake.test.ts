import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIncomingDocumentExtractionResponse } from "./incoming-document-ai-extract";

const read = (p: string) => readFileSync(p, "utf8");

// Tham khảo luồng "Upload văn bản → AI tự đọc & điền → kiểm tra → tạo công
// việc với Chủ trì/Phối hợp" từ một app ngoài, áp dụng cho module Công văn
// đến (incoming_documents) hiện có. Không có API key AI từ trước (xác nhận
// qua biến môi trường) — dùng Anthropic, gọi trực tiếp REST API (không thêm
// SDK), người dùng luôn kiểm tra/sửa trước khi lưu (không tự ghi incoming_documents).
describe("parseIncomingDocumentExtractionResponse — đọc JSON do AI trả về", () => {
  it("đọc đúng JSON hợp lệ, không có cảnh báo khi đủ trường", () => {
    const result = parseIncomingDocumentExtractionResponse(
      JSON.stringify({
        document_no: "123/QĐ-SYT",
        document_date: "2026-01-05",
        issuing_authority: "Sở Y tế",
        document_type: "Quyết định",
        due_date: "2026-01-20",
        summary: "Về việc triển khai khám sức khỏe toàn dân.",
      }),
    );
    expect(result.fields).toEqual({
      document_no: "123/QĐ-SYT",
      document_date: "2026-01-05",
      issuing_authority: "Sở Y tế",
      document_type: "Quyết định",
      due_date: "2026-01-20",
      summary: "Về việc triển khai khám sức khỏe toàn dân.",
    });
    expect(result.warnings).toEqual([]);
  });

  it("chịu được chữ thừa trước/sau JSON (AI không tuân thủ tuyệt đối 'chỉ trả JSON')", () => {
    const result = parseIncomingDocumentExtractionResponse(
      `Đây là kết quả đọc được:\n${JSON.stringify({ document_no: "9/CV", document_date: null, issuing_authority: "UBND", document_type: null, due_date: null, summary: "Thông báo họp." })}\nHết.`,
    );
    expect(result.fields.document_no).toBe("9/CV");
    expect(result.fields.issuing_authority).toBe("UBND");
    expect(result.fields.summary).toBe("Thông báo họp.");
  });

  it("không bịa dữ liệu khi AI không trả về JSON đọc được — trả tất cả null kèm cảnh báo", () => {
    const result = parseIncomingDocumentExtractionResponse("Xin lỗi, tôi không đọc được file này.");
    expect(result.fields).toEqual({
      document_no: null,
      document_date: null,
      issuing_authority: null,
      document_type: null,
      due_date: null,
      summary: null,
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("loại bỏ ngày sai định dạng (không phải YYYY-MM-DD) thay vì đưa thẳng vào form", () => {
    const result = parseIncomingDocumentExtractionResponse(
      JSON.stringify({ document_no: "1/CV", document_date: "05/01/2026", issuing_authority: "SYT", document_type: "Công văn", due_date: "20-01-2026", summary: "Nội dung." }),
    );
    expect(result.fields.document_date).toBeNull();
    expect(result.fields.due_date).toBeNull();
    expect(result.warnings.some((w) => w.includes("Ngày văn bản"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Hạn xử lý"))).toBe(true);
  });

  it("gắn cảnh báo riêng cho từng trường còn thiếu, không gộp chung một câu mơ hồ", () => {
    const result = parseIncomingDocumentExtractionResponse(
      JSON.stringify({ document_no: null, document_date: null, issuing_authority: "SYT", document_type: null, due_date: null, summary: "Nội dung." }),
    );
    expect(result.warnings.some((w) => w.includes("Số/Ký hiệu"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Loại văn bản"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Hạn xử lý"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Cơ quan ban hành"))).toBe(false);
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

describe("API /api/incoming-documents/extract — đọc file, không tự ghi dữ liệu", () => {
  const route = read("src/app/api/incoming-documents/extract/route.ts");

  it("yêu cầu quyền incoming_documents.manage và báo lỗi rõ nếu chưa cấu hình ANTHROPIC_API_KEY", () => {
    expect(route).toContain('requireApiPermission("incoming_documents.manage")');
    expect(route).toContain("process.env.ANTHROPIC_API_KEY");
    expect(route).toContain("Chưa cấu hình ANTHROPIC_API_KEY");
  });

  it("chỉ chấp nhận PDF/DOCX, giới hạn 10MB", () => {
    expect(route).toContain('const MAX_FILE_SIZE = 10 * 1024 * 1024;');
    expect(route).toContain('.endsWith(".pdf")');
    expect(route).toContain('.endsWith(".docx")');
    expect(route).toContain("Chỉ chấp nhận file PDF hoặc DOCX.");
  });

  it("PDF gửi thẳng cho Claude (hỗ trợ cả bản scan qua vision); DOCX trích chữ bằng mammoth trước khi gửi", () => {
    expect(route).toContain("mammoth.extractRawText");
    expect(route).toContain("pdfBase64: buffer.toString(\"base64\")");
  });

  it("không ghi vào incoming_documents — chỉ trả fields/warnings để người dùng tự kiểm tra", () => {
    expect(route).not.toContain('.from("incoming_documents")');
    expect(route).toContain("ok: true, fields: result.fields, warnings: result.warnings");
  });
});

describe("API /api/incoming-documents/[id]/file — đính kèm theo đúng quy ước document_publications", () => {
  const route = read("src/app/api/incoming-documents/[id]/file/route.ts");

  it("dùng chung bucket qlcl-evidence và evidenceFilePolicy để lọc loại file", () => {
    expect(route).toContain('const BUCKET = "qlcl-evidence"');
    expect(route).toContain('evidenceFilePolicy(originalFileName)');
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

describe("UI incoming-documents-client.tsx: upload AI + tạo công việc chủ trì/phối hợp", () => {
  const client = read("src/components/incoming-documents-client.tsx");

  it("có nút 'Đọc và điền thông tin' gọi /api/incoming-documents/extract rồi điền sẵn form", () => {
    expect(client).toContain('"/api/incoming-documents/extract"');
    expect(client).toContain("Đọc và điền thông tin");
    expect(client).toContain("if (fields.summary) setSummary(fields.summary);");
  });

  it("sau khi tạo công văn, tự đính kèm file đã dùng để đọc (nếu có)", () => {
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
