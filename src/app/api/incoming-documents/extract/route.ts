import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { requireApiPermission } from "@/lib/api-auth";
import { callAnthropicExtraction, parseIncomingDocumentExtractionResponse } from "@/lib/incoming-document-ai-extract";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MODEL = "claude-sonnet-5-5";

// Đọc PDF/DOCX và trả về các trường gợi ý cho form "Tiếp nhận công văn" —
// KHÔNG lưu gì vào incoming_documents ở đây; người dùng luôn kiểm tra/sửa
// trước khi bấm "Tiếp nhận" (tạo bản ghi qua POST /api/incoming-documents
// như bình thường).
export async function POST(request: Request) {
  const auth = await requireApiPermission("incoming_documents.manage");
  if (!auth.ok) return auth.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chưa cấu hình ANTHROPIC_API_KEY trên máy chủ. Vui lòng liên hệ quản trị hệ thống để thêm biến môi trường rồi thử lại." },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const fileValue = formData?.get("file");
  if (!(fileValue instanceof File)) return NextResponse.json({ error: "Vui lòng chọn file PDF hoặc DOCX." }, { status: 400 });
  if (fileValue.size <= 0) return NextResponse.json({ error: "File đang trống." }, { status: 400 });
  if (fileValue.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Dung lượng file tối đa là 10 MB." }, { status: 400 });

  const lowerName = (fileValue.name || "").toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isDocx = lowerName.endsWith(".docx");
  if (!isPdf && !isDocx) return NextResponse.json({ error: "Chỉ chấp nhận file PDF hoặc DOCX." }, { status: 400 });

  try {
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    let rawText: string;
    if (isPdf) {
      rawText = await callAnthropicExtraction({ apiKey, model: MODEL, pdfBase64: buffer.toString("base64") });
    } else {
      const { value: docxText } = await mammoth.extractRawText({ buffer });
      if (!docxText.trim()) return NextResponse.json({ error: "Không đọc được nội dung từ file DOCX." }, { status: 400 });
      rawText = await callAnthropicExtraction({ apiKey, model: MODEL, text: docxText.slice(0, 20000) });
    }
    const result = parseIncomingDocumentExtractionResponse(rawText);
    return NextResponse.json({ ok: true, fields: result.fields, warnings: result.warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không đọc được file." }, { status: 502 });
  }
}
