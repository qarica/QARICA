import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế: rà soát "Việc của tôi" theo yêu cầu — phát hiện
// TasksPage khai báo `const today=hcmToday();` sau khi đã DÙNG `today`
// trong `emrKpiRows=myEmrItems.map((item)=>{...item.due_date<today...})`.
// `.map()` gọi callback NGAY (đồng bộ) nên mọi lần render trang có ít nhất
// 1 hạng mục EMR của khoa/phòng mình (myEmrItems.length>0) sẽ ném
// `ReferenceError: Cannot access 'today' before initialization` — const
// nằm trong "temporal dead zone" tới đúng dòng khai báo của nó, kể cả khi
// bị dùng qua một callback lồng bên trong cùng scope hàm. tsc không bắt
// được lỗi này (chỉ cảnh báo use-before-declare ở cấp top-level, không
// theo dõi qua closure) — xác nhận bằng cách biên dịch trực tiếp, 0
// diagnostic — nên phải chặn bằng test đọc thứ tự dòng thực tế.
describe("Việc của tôi (/tasks) — `today` phải được khai báo TRƯỚC khi dùng trong emrKpiRows", () => {
  const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("const today=hcmToday() xuất hiện trước lần dùng đầu tiên trong emrKpiRows (bên trong .map())", () => {
    const declIndex = source.indexOf("const today=hcmToday()");
    const useIndex = source.indexOf("emrKpiRows=myEmrItems.map");
    expect(declIndex).toBeGreaterThan(-1);
    expect(useIndex).toBeGreaterThan(-1);
    expect(declIndex).toBeLessThan(useIndex);
  });

  it("chỉ có đúng 1 khai báo `const today` trong toàn file (không khai báo trùng/còn sót bản cũ)", () => {
    const matches = source.match(/const today=hcmToday\(\)/g) || [];
    expect(matches.length).toBe(1);
  });
});
