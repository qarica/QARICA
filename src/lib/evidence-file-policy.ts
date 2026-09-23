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
