import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lỗi thực tế trên điện thoại: hàng tìm kiếm/lọc "Bảng tự đánh giá" dùng
// gridTemplateColumns cố định "minmax(220px,1fr) 190px auto" — rộng hơn mọi
// màn hình điện thoại. Vì .panel cha có overflow:hidden, toàn bộ card bên
// dưới (từng tiêu chí A1, B1...) bị kéo giãn theo bề rộng tối thiểu đó rồi bị
// cắt cụt bên phải, không cuộn được. Sửa bằng cách cho phép hàng này tự co
// số cột theo bề rộng màn hình (auto-fit/minmax) thay vì ép cột cố định.
describe("assessment-criteria-client.tsx: hàng tìm kiếm/lọc không ép chiều rộng tối thiểu vượt màn hình điện thoại", () => {
  const client = readFileSync("src/components/assessment-criteria-client.tsx", "utf8");

  it("không còn gridTemplateColumns cố định kiểu minmax(220px,1fr) 190px auto", () => {
    expect(client).not.toContain('gridTemplateColumns:"minmax(220px,1fr) 190px auto"');
  });

  it("dùng repeat(auto-fit,minmax(...)) để hàng tự co cột theo bề rộng khả dụng", () => {
    expect(client).toContain('gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))"');
  });
});
