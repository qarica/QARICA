import { describe, expect, it } from "vitest";
import { buildAssignmentDecisionDraft, formatDateVN } from "./practitioner-credentials";

describe("formatDateVN", () => {
  it("converts ISO yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(formatDateVN("2026-06-16")).toBe("16/06/2026");
  });
  it("returns empty string for null/undefined", () => {
    expect(formatDateVN(null)).toBe("");
    expect(formatDateVN(undefined)).toBe("");
  });
});

describe("buildAssignmentDecisionDraft", () => {
  it("always opens with the draft-disclaimer line (deterministic generator, not AI — must never be mistaken for a final signed document)", () => {
    const text = buildAssignmentDecisionDraft({ full_name: "Nguyễn Văn A" });
    expect(text.startsWith("[BẢN NHÁP TỰ ĐỘNG")).toBe(true);
    expect(text).toContain("Không dùng trực tiếp làm văn bản chính thức.");
  });

  it("includes license, scope of practice, and signing fields when present", () => {
    const text = buildAssignmentDecisionDraft({
      full_name: "Đoàn Thị A",
      date_of_birth: "1998-06-16",
      license_type: "GPHN",
      license_number: "000000/CM-GPHN",
      license_issued_at: "2024-06-24",
      license_issued_by: "Sở Y tế tỉnh Cà Mau",
      professional_title: "Bác sĩ",
      scope_of_practice: "Sản phụ khoa",
      decision_no: "16/QĐ-PC-PKSG",
      decision_signed_at: "2025-12-09",
      decision_signed_by: "BS CK II Phạm M",
    });
    expect(text).toContain("Đoàn Thị A (sinh ngày 16/06/1998)");
    expect(text).toContain("Giấy phép hành nghề số 000000/CM-GPHN do Sở Y tế tỉnh Cà Mau cấp ngày 24/06/2024;");
    expect(text).toContain("- Phạm vi hành nghề: Sản phụ khoa");
    expect(text).toContain("Số: 16/QĐ-PC-PKSG");
    expect(text).toContain("09/12/2025");
    expect(text).toContain("BS CK II Phạm M");
  });

  // Phạm vi bổ sung/điều chỉnh chỉ còn 1 nguồn duy nhất: bảng con documents
  // (document_type='SCOPE_ADJUSTMENT'), không còn cột phẳng trùng lặp trên
  // chính credential (đã dọn ở migration 20261118000000) — cho phép nhiều
  // lần bổ sung theo thời gian thay vì chỉ giữ được 1 bản ghi "hiện tại".
  it("lists every SCOPE_ADJUSTMENT document with its decision reference (the only source now, not a duplicated flat field on the credential)", () => {
    const text = buildAssignmentDecisionDraft({ full_name: "Nguyễn Thị B" }, [
      { document_type: "SCOPE_ADJUSTMENT", title: "Tai Mũi Họng", document_no: "2436/QĐ-SYT", issued_at: "2025-12-02", issued_by: "Sở Y tế tỉnh Vĩnh Long" },
    ]);
    expect(text).toContain("- Phạm vi bổ sung theo quyết định: Tai Mũi Họng (QĐ số 2436/QĐ-SYT ngày 02/12/2025 của Sở Y tế tỉnh Vĩnh Long)");
  });

  it("lists every CERTIFICATE document (not hard-coded to 2, unlike the source spreadsheet's Chứng chỉ 1/Chứng chỉ 2 columns)", () => {
    const text = buildAssignmentDecisionDraft({ full_name: "Nguyễn Thị B" }, [
      { document_type: "CERTIFICATE", title: "Siêu âm tổng quát", document_no: "1513/ĐHYTD", issued_at: "2025-05-30", issued_by: "Trường ĐH Y Dược Cần Thơ" },
      { document_type: "CERTIFICATE", title: "Nội soi dạ dày", document_no: "83/2", issued_at: "2017-06-05", issued_by: "Trung Tâm Đào Tạo và Chỉ Đạo Tuyến" },
      { document_type: "CERTIFICATE", title: "Nội soi điều trị", document_no: "1651/2017-B12", issued_at: "2017-09-28", issued_by: "Trung Tâm Đào Tạo và Chỉ Đạo Tuyến" },
    ]);
    expect(text).toContain("- Chứng chỉ: Siêu âm tổng quát, số 1513/ĐHYTD, Trường ĐH Y Dược Cần Thơ cấp ngày 30/05/2025");
    expect(text).toContain("- Chứng chỉ: Nội soi dạ dày, số 83/2, Trung Tâm Đào Tạo và Chỉ Đạo Tuyến cấp ngày 05/06/2017");
    expect(text).toContain("- Chứng chỉ: Nội soi điều trị, số 1651/2017-B12, Trung Tâm Đào Tạo và Chỉ Đạo Tuyến cấp ngày 28/09/2017");
  });

  it("cites DEGREE and SPECIALIST_DEGREE documents as căn cứ", () => {
    const text = buildAssignmentDecisionDraft({ full_name: "Nguyễn Thị B" }, [
      { document_type: "DEGREE", title: "Bằng Bác Sĩ Y Khoa", issued_at: "2020-05-19", issued_by: "Trường Đại học Võ Trường Toản" },
      { document_type: "SPECIALIST_DEGREE", title: "Chuyên khoa I", specialization: "Tai Mũi Họng", issued_at: "2025-10-25", issued_by: "Trường Đại học Y Dược Cần Thơ" },
    ]);
    expect(text).toContain("Căn cứ Bằng Bác Sĩ Y Khoa, Trường Đại học Võ Trường Toản cấp ngày 19/05/2020;");
    expect(text).toContain("Căn cứ Chuyên khoa I chuyên ngành Tai Mũi Họng, Trường Đại học Y Dược Cần Thơ cấp ngày 25/10/2025;");
  });
});
