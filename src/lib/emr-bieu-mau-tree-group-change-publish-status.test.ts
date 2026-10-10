import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Báo cáo thực tế: "Lỗi khi bấm đổi nhóm trong cây biểu là bị trả về trạng
// thái duyệt phát hành là chưa đúng" — gốc rễ sâu hơn commit trước (loại
// record_types/binding_group/binding_group_order khỏi so sánh nội dung):
// cột emr_rollout_items.details là jsonb, và Postgres KHÔNG giữ nguyên thứ
// tự key khi lưu (tự chuẩn hoá nội bộ theo độ dài rồi alphabet). sanitizeDetails
// luôn dựng lại object theo đúng thứ tự khai báo field trong
// EMR_CATEGORY_FIELDS — khác thứ tự Postgres trả về cho existing.details. So
// sánh bằng JSON.stringify thường (nhạy thứ tự key) nên 2 object CÙNG GIÁ TRỊ
// vẫn ra 2 chuỗi khác nhau → contentChanged luôn true → MỌI PATCH có gửi
// details (đổi nhóm/thứ tự gáy ở Cây biểu mẫu, hay bất kỳ field nào khác)
// đều tự rút biểu mẫu đã duyệt về Nháp, không chỉ riêng trường hợp đổi nhóm.
describe("EMR Biểu mẫu — đổi nhóm/thứ tự gáy ở Cây biểu mẫu không còn tự rút duyệt phát hành về Nháp do lệch thứ tự key jsonb", () => {
  const patchRoute = read("src/app/api/emr/items/[id]/route.ts");

  it("so sánh nội dung details dùng canonicalJSON (chuẩn hoá thứ tự key đệ quy) thay vì JSON.stringify nhạy thứ tự key", () => {
    expect(patchRoute).toContain("function canonicalJSON(value: unknown): string {");
    expect(patchRoute).toContain("canonicalJSON(detailsForContentComparison(patch.details as Record<string, unknown>)) !== canonicalJSON(detailsForContentComparison(existing.details))");
  });

  it("gate record_types (chặn gán phạm vi khi còn Nháp) cũng so theo GIÁ TRỊ (canonicalJSON) chứ không theo tham chiếu mảng", () => {
    expect(patchRoute).toContain('canonicalJSON(nextRecordTypes ?? null) !== canonicalJSON(existingRecordTypes ?? null)');
  });

  // Chạy thật hàm canonicalJSON (trích trực tiếp từ source, không chép lại
  // thuật toán) để xác nhận hành vi đúng — không chỉ so khớp chuỗi.
  function loadCanonicalJSON(): (value: unknown) => string {
    const match = patchRoute.match(/function canonicalJSON\(value: unknown\): string \{[\s\S]*?\n\}\n/);
    if (!match) throw new Error("canonicalJSON not found in route source");
    const js = ts.transpileModule(`${match[0]}\nexport { canonicalJSON };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const factory = new Function("exports", `${js}\nreturn exports.canonicalJSON;`);
    return factory({});
  }

  it("object với thứ tự key khác nhau nhưng giá trị giống nhau → cùng 1 chuỗi canonical", () => {
    const canonicalJSON = loadCanonicalJSON();
    const a = { binding_group: "Gáy A", form_code: "BM-01", digitized: "Đã số hóa" };
    const b = { digitized: "Đã số hóa", form_code: "BM-01", binding_group: "Gáy A" };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
  });

  it("object thực sự khác giá trị → ra chuỗi canonical khác nhau", () => {
    const canonicalJSON = loadCanonicalJSON();
    const a = { binding_group: "Gáy A" };
    const b = { binding_group: "Gáy B" };
    expect(canonicalJSON(a)).not.toBe(canonicalJSON(b));
  });

  it("giữ nguyên thứ tự phần tử trong mảng (chỉ chuẩn hoá key object, không sắp lại mảng) và chuẩn hoá đệ quy object lồng trong mảng (vd signing_sequence)", () => {
    const canonicalJSON = loadCanonicalJSON();
    const nested1 = { signing_sequence: [{ role: "Bác sĩ", method: "Ký số" }, { method: "Đóng dấu", role: "Điều dưỡng" }] };
    const nested2 = { signing_sequence: [{ method: "Ký số", role: "Bác sĩ" }, { role: "Điều dưỡng", method: "Đóng dấu" }] };
    expect(canonicalJSON(nested1)).toBe(canonicalJSON(nested2));
    const reordered = { signing_sequence: [{ role: "Điều dưỡng", method: "Đóng dấu" }, { role: "Bác sĩ", method: "Ký số" }] };
    expect(canonicalJSON(nested1)).not.toBe(canonicalJSON(reordered));
  });
});
