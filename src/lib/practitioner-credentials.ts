export type CredentialDocumentType = "DEGREE" | "SPECIALIST_DEGREE" | "CERTIFICATE" | "SCOPE_ADJUSTMENT";

export type CredentialDocument = {
  document_type: CredentialDocumentType;
  title: string;
  specialization?: string | null;
  document_no?: string | null;
  issued_at?: string | null;
  issued_by?: string | null;
  note?: string | null;
};

export type PractitionerCredential = {
  full_name: string;
  date_of_birth?: string | null;
  license_type?: string | null;
  license_number?: string | null;
  license_issued_at?: string | null;
  license_issued_by?: string | null;
  professional_title?: string | null;
  display_title?: string | null;
  scope_of_practice?: string | null;
  scope_adjustment_text?: string | null;
  scope_adjustment_decision_no?: string | null;
  scope_adjustment_decision_at?: string | null;
  scope_adjustment_issued_by?: string | null;
  proposed_technique?: string | null;
  decision_no?: string | null;
  decision_signed_at?: string | null;
  decision_signed_by?: string | null;
};

const LICENSE_TYPE_LABEL: Record<string, string> = {
  GPHN: "Giấy phép hành nghề",
  CCHN: "Chứng chỉ hành nghề",
  CCHN_DUOC: "Chứng chỉ hành nghề Dược",
};

export function formatDateVN(value?: string | null): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Sinh BẢN NHÁP văn bản "Quyết định phân công người hành nghề" từ dữ liệu hồ
// sơ — thay cho bước thủ công trong file Excel gốc (ghép công thức rồi copy
// tay sang ChatGPT). Hoàn toàn xác định (deterministic), không gọi AI. Luôn
// mở đầu bằng dòng cảnh báo "bản nháp" vì đây không phải mẫu nội bộ chính
// thức của từng đơn vị — người có thẩm quyền QLCL/lãnh đạo phải rà soát căn
// cứ pháp lý, số liệu và văn phong trước khi trình ký.
export function buildAssignmentDecisionDraft(credential: PractitionerCredential, documents: CredentialDocument[] = []): string {
  const lines: string[] = [];
  lines.push("[BẢN NHÁP TỰ ĐỘNG — người có thẩm quyền QLCL/lãnh đạo đơn vị cần rà soát số liệu, căn cứ pháp lý và văn phong trước khi trình ký. Không dùng trực tiếp làm văn bản chính thức.]");
  lines.push("");
  lines.push("QUYẾT ĐỊNH");
  lines.push("Về việc phân công phạm vi hoạt động chuyên môn cho người hành nghề");
  lines.push(`Số: ${credential.decision_no || "......."}`);
  lines.push("");
  lines.push("Căn cứ Luật Khám bệnh, chữa bệnh số 15/2023/QH15;");
  lines.push("Căn cứ Nghị định số 96/2023/NĐ-CP quy định chi tiết một số điều của Luật Khám bệnh, chữa bệnh;");

  if (credential.license_number) {
    const label = LICENSE_TYPE_LABEL[credential.license_type || ""] || "Giấy phép/Chứng chỉ hành nghề";
    const issuedBy = credential.license_issued_by ? ` do ${credential.license_issued_by} cấp` : "";
    const issuedAt = credential.license_issued_at ? ` ngày ${formatDateVN(credential.license_issued_at)}` : "";
    lines.push(`Căn cứ ${label} số ${credential.license_number}${issuedBy}${issuedAt};`);
  }

  const degree = documents.find((d) => d.document_type === "DEGREE");
  if (degree) {
    const issuedBy = degree.issued_by ? `, ${degree.issued_by} cấp` : "";
    const issuedAt = degree.issued_at ? ` ngày ${formatDateVN(degree.issued_at)}` : "";
    lines.push(`Căn cứ ${degree.title}${issuedBy}${issuedAt};`);
  }
  const specialistDegree = documents.find((d) => d.document_type === "SPECIALIST_DEGREE");
  if (specialistDegree) {
    const specialization = specialistDegree.specialization ? ` chuyên ngành ${specialistDegree.specialization}` : "";
    const issuedBy = specialistDegree.issued_by ? `, ${specialistDegree.issued_by} cấp` : "";
    const issuedAt = specialistDegree.issued_at ? ` ngày ${formatDateVN(specialistDegree.issued_at)}` : "";
    lines.push(`Căn cứ ${specialistDegree.title}${specialization}${issuedBy}${issuedAt};`);
  }
  lines.push("Theo đề nghị của bộ phận phụ trách chuyên môn,");
  lines.push("");
  lines.push("QUYẾT ĐỊNH:");
  lines.push("");

  const titleForDoc = credential.display_title || credential.professional_title || "";
  const dob = credential.date_of_birth ? ` (sinh ngày ${formatDateVN(credential.date_of_birth)})` : "";
  const titleClause = titleForDoc ? `, chức danh ${titleForDoc},` : "";
  lines.push(`Điều 1. Phân công Ông/Bà ${credential.full_name}${dob}${titleClause} được thực hiện khám bệnh, chữa bệnh theo phạm vi hành nghề sau:`);

  if (credential.scope_of_practice) lines.push(`- Phạm vi hành nghề: ${credential.scope_of_practice}`);

  if (credential.scope_adjustment_text) {
    const no = credential.scope_adjustment_decision_no ? ` số ${credential.scope_adjustment_decision_no}` : "";
    const at = credential.scope_adjustment_decision_at ? ` ngày ${formatDateVN(credential.scope_adjustment_decision_at)}` : "";
    const by = credential.scope_adjustment_issued_by ? ` của ${credential.scope_adjustment_issued_by}` : "";
    const qd = no || at || by ? ` (theo QĐ${no}${at}${by})` : "";
    lines.push(`- Phạm vi bổ sung/điều chỉnh: ${credential.scope_adjustment_text}${qd}`);
  }

  for (const c of documents.filter((d) => d.document_type === "CERTIFICATE")) {
    const no = c.document_no ? `, số ${c.document_no}` : "";
    const by = c.issued_by ? `, ${c.issued_by} cấp` : "";
    const at = c.issued_at ? ` ngày ${formatDateVN(c.issued_at)}` : "";
    lines.push(`- Chứng chỉ: ${c.title}${no}${by}${at}`);
  }

  for (const s of documents.filter((d) => d.document_type === "SCOPE_ADJUSTMENT")) {
    const no = s.document_no ? ` số ${s.document_no}` : "";
    const at = s.issued_at ? ` ngày ${formatDateVN(s.issued_at)}` : "";
    const by = s.issued_by ? ` của ${s.issued_by}` : "";
    const qd = no || at || by ? ` (QĐ${no}${at}${by})` : "";
    lines.push(`- Phạm vi bổ sung theo quyết định: ${s.title}${qd}`);
  }

  if (credential.proposed_technique) lines.push(`- Kỹ thuật chuyên môn được thực hiện thêm: ${credential.proposed_technique}`);

  lines.push("");
  lines.push(`Điều 2. Ông/Bà ${credential.full_name} có trách nhiệm thực hiện đúng phạm vi hành nghề được phân công tại Điều 1, tuân thủ quy chế chuyên môn và quy định pháp luật hiện hành về khám bệnh, chữa bệnh.`);
  lines.push("");
  lines.push("Điều 3. Quyết định này có hiệu lực kể từ ngày ký. Các bộ phận liên quan và người được phân công chịu trách nhiệm thi hành quyết định này.");
  lines.push("");
  lines.push("Nơi nhận:");
  lines.push("- Như Điều 3;");
  lines.push("- Lưu hồ sơ nhân sự.");
  lines.push("");
  if (credential.decision_signed_at) lines.push(`......., ngày ${formatDateVN(credential.decision_signed_at)}`);
  lines.push("NGƯỜI KÝ");
  if (credential.decision_signed_by) lines.push(credential.decision_signed_by);

  return lines.join("\n");
}
