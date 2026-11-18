// Báo cáo thực tế: "Chưa có mã hoá lớp đào tạo. Nếu cùng chủ đề thì cùng mã
// lớp nhưng .1 hoặc .2, .n" — "+ Tạo lớp mới cùng chủ đề" (duplicate route)
// trước đây copy Y NGUYÊN procedure_code của lớp nguồn sang lớp mới, nên
// nhiều lớp cùng chủ đề mang cùng 1 mã, không phân biệt được lớp nào là
// lớp nào. Định dạng chốt: <mã gốc>.<số thứ tự lớp> (vd lớp 1 là ATPT.1,
// lớp 2 là ATPT.2...). Chỉ áp dụng khi lớp nguồn CÓ mã (procedure_code) —
// không tự đặt mã cho lớp chưa từng có mã.

export function baseClassCode(code: string): string {
  return code.replace(/\.\d+$/, "");
}

export function classCodeSequence(code: string): number | null {
  const m = code.match(/\.(\d+)$/);
  return m ? Number(m[1]) : null;
}

// existingCodesInTopic: mã lớp (procedure_code) của mọi lớp hiện có cùng
// chủ đề, KỂ CẢ mã của chính lớp nguồn đang được nhân bản. sourceCode: mã
// lớp nguồn. Trả về newCode cho lớp mới, và sourceCode (khác null) khi lớp
// nguồn cần được gắn số thứ tự lần đầu (".1") vì trước đó chưa có số.
export function nextClassCodes(sourceCode: string, existingCodesInTopic: string[]): { sourceCode: string | null; newCode: string } {
  const base = baseClassCode(sourceCode);
  const sequencesInTopic = existingCodesInTopic
    .filter((c) => baseClassCode(c) === base)
    .map((c) => classCodeSequence(c))
    .filter((n): n is number => n !== null);
  const sourceNeedsSeq = classCodeSequence(sourceCode) === null;
  const maxSeq = Math.max(0, ...sequencesInTopic, sourceNeedsSeq ? 1 : 0);
  return {
    sourceCode: sourceNeedsSeq ? `${base}.1` : null,
    newCode: `${base}.${maxSeq + 1}`,
  };
}
