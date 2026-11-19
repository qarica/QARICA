import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế: "Bổ sung chức danh Dược sĩ" — JOB_TITLE_OPTIONS ở cả 2
// form công khai (đăng ký đào tạo + tự test) trước đây thiếu hẳn "Dược sĩ"
// dù dữ liệu nhập tay/import cũ đã có người mang chức danh này (thấy ở
// biểu đồ "So sánh trước/sau theo chức danh" — cột "Dược sĩ" có dữ liệu
// nhưng không ai chọn được lựa chọn này qua form công khai). 2 file giữ
// danh sách riêng (không share 1 module) nên khoá cả 2 cùng lúc để không
// lệch nhau sau này.
describe("JOB_TITLE_OPTIONS: có Dược sĩ, đồng bộ giữa form đăng ký và form tự test", () => {
  it("lam-bai/[roundId]/page.tsx (form tự test) có Dược sĩ", () => {
    const file = readFileSync("src/app/lam-bai/[roundId]/page.tsx", "utf8");
    expect(file).toContain('const JOB_TITLE_OPTIONS = ["Bác sĩ", "Dược sĩ", "Điều dưỡng/Hộ sinh/Kỹ thuật viên", "Nhân viên văn phòng", "Khác"] as const;');
  });

  it("dang-ky-dao-tao/[trainingId]/page.tsx (form đăng ký đào tạo) có Dược sĩ", () => {
    const file = readFileSync("src/app/dang-ky-dao-tao/[trainingId]/page.tsx", "utf8");
    expect(file).toContain('const JOB_TITLE_OPTIONS = ["Bác sĩ", "Dược sĩ", "Điều dưỡng/Hộ sinh/Kỹ thuật viên", "Nhân viên văn phòng", "Khác"] as const;');
  });
});
