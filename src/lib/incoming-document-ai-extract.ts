// Đọc công văn (PDF/DOCX) bằng Claude và trích xuất các trường của
// incoming_documents thành JSON. Người dùng LUÔN kiểm tra/sửa trước khi lưu
// — route gọi hàm này không tự ghi incoming_documents.
export type IncomingDocumentExtractedFields = {
  document_no: string | null;
  document_date: string | null;
  issuing_authority: string | null;
  document_type: string | null;
  due_date: string | null;
  summary: string | null;
};

export type IncomingDocumentExtractionResult = {
  fields: IncomingDocumentExtractedFields;
  warnings: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_LABELS: Record<keyof IncomingDocumentExtractedFields, string> = {
  document_no: "Số/Ký hiệu",
  document_date: "Ngày văn bản",
  issuing_authority: "Cơ quan ban hành",
  document_type: "Loại văn bản",
  due_date: "Hạn xử lý",
  summary: "Trích yếu nội dung",
};

export const INCOMING_DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `Bạn là trợ lý đọc công văn hành chính tiếng Việt cho hệ thống quản lý chất lượng bệnh viện QARICA.
Nhiệm vụ: đọc nội dung văn bản được cung cấp và trích xuất đúng các trường sau, trả lời DUY NHẤT bằng một đối tượng JSON hợp lệ, không thêm bất kỳ chữ nào khác trước hoặc sau JSON:
{
  "document_no": string | null,
  "document_date": string | null,
  "issuing_authority": string | null,
  "document_type": string | null,
  "due_date": string | null,
  "summary": string | null
}
Giải thích từng trường:
- document_no: Số/Ký hiệu văn bản, ví dụ "123/QĐ-SYT".
- document_date: Ngày ban hành văn bản, định dạng YYYY-MM-DD.
- issuing_authority: Cơ quan/đơn vị ban hành hoặc gửi văn bản.
- document_type: Loại văn bản (Công văn, Quyết định, Thông báo, Chỉ thị, Kế hoạch...).
- due_date: Hạn xử lý/phản hồi nếu văn bản nêu rõ, định dạng YYYY-MM-DD; nếu không có thì null.
- summary: Trích yếu nội dung chính, tóm tắt ngắn gọn 1-2 câu.
Nếu không chắc chắn hoặc không tìm thấy một trường, trả về null cho trường đó — KHÔNG bịa thông tin.`;

export function parseIncomingDocumentExtractionResponse(raw: string): IncomingDocumentExtractionResult {
  const warnings: string[] = [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const fields: IncomingDocumentExtractedFields = {
    document_no: null,
    document_date: null,
    issuing_authority: null,
    document_type: null,
    due_date: null,
    summary: null,
  };

  if (!parsed || typeof parsed !== "object") {
    warnings.push("AI không trả về dữ liệu đọc được từ văn bản. Vui lòng nhập tay.");
    return { fields, warnings };
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(fields) as (keyof IncomingDocumentExtractedFields)[]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }

  if (fields.document_date && !DATE_RE.test(fields.document_date)) {
    warnings.push(`Ngày văn bản đọc được ("${fields.document_date}") không đúng định dạng, vui lòng kiểm tra lại.`);
    fields.document_date = null;
  }
  if (fields.due_date && !DATE_RE.test(fields.due_date)) {
    warnings.push(`Hạn xử lý đọc được ("${fields.due_date}") không đúng định dạng, vui lòng kiểm tra lại.`);
    fields.due_date = null;
  }

  for (const key of Object.keys(fields) as (keyof IncomingDocumentExtractedFields)[]) {
    if (!fields[key]) warnings.push(`Không xác định được "${FIELD_LABELS[key]}" — vui lòng kiểm tra và nhập tay nếu cần.`);
  }

  return { fields, warnings };
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export async function callAnthropicExtraction({
  apiKey,
  model,
  pdfBase64,
  text,
}: {
  apiKey: string;
  model: string;
  pdfBase64?: string;
  text?: string;
}): Promise<string> {
  const contentBlocks: Array<Record<string, unknown>> = [];
  if (pdfBase64) {
    contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
    contentBlocks.push({ type: "text", text: "Đọc văn bản PDF ở trên và trích xuất thông tin theo đúng định dạng JSON đã yêu cầu." });
  } else {
    contentBlocks.push({ type: "text", text: `Nội dung văn bản:\n\n${text || ""}\n\nTrích xuất thông tin theo đúng định dạng JSON đã yêu cầu.` });
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: INCOMING_DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gọi AI thất bại (HTTP ${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data?.content) ? data.content.find((block: { type?: string }) => block?.type === "text") : null;
  if (!textBlock?.text) throw new Error("AI không trả về nội dung văn bản.");
  return textBlock.text as string;
}
