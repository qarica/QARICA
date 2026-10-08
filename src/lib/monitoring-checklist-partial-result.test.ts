import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Bảng kiểm QTKT/phác đồ điều trị dùng chung engine "generic checklist" (không
// phải Bảng kiểm thường quy Hồ sơ bệnh án — module đó dùng hsba_checklist_templates
// riêng và không bị đụng tới ở đây, cũng không phải 5S — có màn hình chấm điểm
// riêng). Trước đây, câu trả lời mặc định (PASS_FAIL, không có options) chỉ có
// 2 nút Đạt/Không đạt dù backend (ALLOWED_RESULTS, RPC lưu kết quả) đã luôn hỗ
// trợ PARTIAL. Phân nhóm tiêu chí tự khai báo đã có sẵn từ trước (nhóm mục/section
// với tên tự nhập) nên không cần sửa.
describe("Generic checklist (QTKT/phác đồ): 4 mức đánh giá thay vì chỉ Đạt/Không đạt", () => {
  it("câu trả lời PASS_FAIL mặc định hiện đủ 4 nút: Đạt, Đạt 1 phần, Không đạt, (Không áp dụng nếu allow_na)", () => {
    const client = read("src/components/generic-checklist-run-client.tsx");
    expect(client).toContain('{ code: "PASS", label: "Đạt" }');
    expect(client).toContain('{ code: "PARTIAL", label: "Đạt 1 phần" }');
    expect(client).toContain('{ code: "FAIL", label: "Không đạt" }');
    expect(client).toContain('{ code: "NA", label: "Không áp dụng" }');
    // Thứ tự khai báo trong mảng nút bấm: PASS rồi PARTIAL rồi FAIL rồi NA.
    const buttonList = client.slice(client.indexOf('{ code: "PASS", label: "Đạt" }'), client.indexOf("].map((opt) => ("));
    expect(buttonList.indexOf('"PASS"')).toBeLessThan(buttonList.indexOf('"PARTIAL"'));
    expect(buttonList.indexOf('"PARTIAL"')).toBeLessThan(buttonList.indexOf('"FAIL"'));
    expect(buttonList.indexOf('"FAIL"')).toBeLessThan(buttonList.indexOf('"NA"'));
  });

  it("chọn PARTIAL trả về result PARTIAL với điểm quy ước 0.5, không rơi vào nhánh FAIL mặc định", () => {
    const client = read("src/components/generic-checklist-run-client.tsx");
    expect(client).toContain('if (chosenValue === "PARTIAL") return { result: "PARTIAL", score: 0.5 };');
  });

  it("backend đã cho phép PARTIAL từ trước (không cần sửa route/RPC)", () => {
    const route = read("src/app/api/monitoring/rounds/[id]/generic-results/route.ts");
    expect(route).toContain('const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "NA", "PARTIAL"]);');
  });

  it("nhóm tiêu chí (section) đã tự khai báo tên từ trước — không hardcode Lâm sàng/Cận lâm sàng", () => {
    const editor = read("src/components/checklist-template-editor-client.tsx");
    expect(editor).toContain("Tên nhóm mục");
    expect(editor).not.toContain('"Lâm sàng"');
    expect(editor).not.toContain('"Cận lâm sàng"');
  });

  it("trang chi tiết đợt giám sát hiển thị nhãn và màu riêng cho Đạt 1 phần, không lẫn vào Không đạt/—", () => {
    const page = read("src/app/(app)/monitoring/[id]/page.tsx");
    expect(page).toContain('PARTIAL: "Đạt một phần"');
    expect(page).toContain('row.response?.result_status === "PARTIAL" ? "warning"');
    expect(page).toContain("partialCount");
  });

  it("xuất CSV đợt giám sát cũng có nhãn cho PARTIAL, không rơi về hiển thị mã thô", () => {
    const route = read("src/app/api/monitoring/rounds/[id]/export/route.ts");
    expect(route).toContain('PARTIAL: "Đạt một phần"');
  });
});
