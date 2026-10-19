import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phát hiện từ rà soát UI↔API↔DB: "Hệ số nhân" (multiplier) đã được API
// (POST /api/indicator-definitions, PATCH /api/indicator-versions/[id]) xử
// lý và lưu đầy đủ từ lâu, nhưng không có ô nhập nào trên giao diện — không
// ai set được qua UI, phải đi vòng qua DB/API trực tiếp.
describe("Chỉ số chất lượng — ô nhập \"Hệ số nhân\" (multiplier)", () => {
  it("form Tạo chỉ số có ô nhập multiplier gửi lên POST /api/indicator-definitions", () => {
    const form = readFileSync("src/app/(app)/indicators/manage/indicator-create-form.tsx", "utf8");
    expect(form).toContain('name="multiplier"');
  });

  it("bảng phiên bản chỉ số có cột Hệ số nhân, sửa được ở phiên bản Nháp và lưu qua PATCH /api/indicator-versions/[id]", () => {
    const detail = readFileSync("src/components/indicator-manage-detail-client.tsx", "utf8");
    expect(detail).toContain("<th>Hệ số nhân</th>");
    expect(detail).toContain("patchVersion(v, { multiplier:");
  });
});
