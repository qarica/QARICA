export type EvidenceFilePolicy = {
  extension: string;
  mimeType: string;
  inlineSafe: boolean;
};

const POLICY_BY_EXTENSION: Record<string, EvidenceFilePolicy> = {
  pdf: { extension: "pdf", mimeType: "application/pdf", inlineSafe: true },
  png: { extension: "png", mimeType: "image/png", inlineSafe: true },
  jpg: { extension: "jpg", mimeType: "image/jpeg", inlineSafe: true },
  jpeg: { extension: "jpeg", mimeType: "image/jpeg", inlineSafe: true },
  webp: { extension: "webp", mimeType: "image/webp", inlineSafe: true },
  gif: { extension: "gif", mimeType: "image/gif", inlineSafe: true },
  txt: { extension: "txt", mimeType: "text/plain; charset=utf-8", inlineSafe: false },
  csv: { extension: "csv", mimeType: "text/csv; charset=utf-8", inlineSafe: false },
  doc: { extension: "doc", mimeType: "application/msword", inlineSafe: false },
  docx: { extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inlineSafe: false },
  xls: { extension: "xls", mimeType: "application/vnd.ms-excel", inlineSafe: false },
  xlsx: { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inlineSafe: false },
  ppt: { extension: "ppt", mimeType: "application/vnd.ms-powerpoint", inlineSafe: false },
  pptx: { extension: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inlineSafe: false },
  zip: { extension: "zip", mimeType: "application/zip", inlineSafe: false },
};

export const EVIDENCE_ALLOWED_EXTENSIONS = Object.keys(POLICY_BY_EXTENSION);

export function evidenceFilePolicy(fileName: string): EvidenceFilePolicy | null {
  const normalized = String(fileName || "").trim().toLowerCase();
  const extension = normalized.includes(".") ? normalized.split(".").pop() || "" : "";
  return POLICY_BY_EXTENSION[extension] || null;
}

export function evidenceInlineSafe(fileName: string, storedMimeType?: string | null) {
  const policy = evidenceFilePolicy(fileName);
  if (!policy?.inlineSafe) return false;
  const actual = String(storedMimeType || "").split(";")[0].trim().toLowerCase();
  const expected = policy.mimeType.split(";")[0].trim().toLowerCase();
  return actual === expected;
}

// Raster-only allowlist for photo-capture uploads (5S checklist ảnh trước/sau
// khắc phục). Trước đây các route này chỉ kiểm tra file.type.startsWith("image/")
// do CLIENT tự khai và lưu thẳng giá trị đó làm Content-Type khi phục vụ —
// "image/svg+xml" cũng khớp điều kiện này nhưng SVG có thể chứa <script> và
// trình duyệt thực thi khi mở trực tiếp (stored XSS). Chỉ chấp nhận các mime
// type ảnh raster cụ thể, không suy diễn/khớp tiền tố.
const SAFE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function safeImageMimeType(mimeType: string | null | undefined): string | null {
  const normalized = String(mimeType || "").split(";")[0].trim().toLowerCase();
  return SAFE_IMAGE_MIME_TYPES.has(normalized) ? normalized : null;
}
