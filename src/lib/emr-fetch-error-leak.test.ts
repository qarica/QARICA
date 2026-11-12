import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Audit giao diện QARICA, hạng Cao #6: toàn bộ 10 route /api/emr/* dùng
// createAdminClient() kể cả cho GET (khác với phần còn lại của app). Khi
// fetch lỗi (mạng, server 500, hoặc body không phải JSON hợp lệ), hầu hết
// client component KHÔNG bọc res.json() an toàn, nên lỗi parser thô
// ("Unexpected end of JSON input", "Unexpected token < in JSON"...) hiện
// thẳng cho người dùng thay vì thông báo thân thiện — chỉ
// emr-command-center.tsx làm đúng từ trước (.catch(()=>null) trước khi
// check r.ok), dùng làm mẫu sửa 4 file còn lại.
describe("EMR client components: res.json() luôn được bọc .catch(() => null) trước khi kiểm tra res.ok/json.ok (không để lỗi parser thô lộ ra người dùng)", () => {
  const files = [
    "src/components/emr-timeline-milestones-client.tsx",
    "src/components/emr-bieu-mau-tree-client.tsx",
    "src/components/emr-category-client.tsx",
    "src/components/emr-bieu-mau-groups-client.tsx",
  ];

  for (const file of files) {
    it(`${file}: không còn lời gọi .json() nào thiếu .catch(() => null)`, () => {
      const src = read(file);
      const unguarded = src
        .split("\n")
        .filter((line) => line.includes(".json()") && !line.includes(".catch("));
      expect(unguarded).toEqual([]);
    });
  }

  it("emr-command-center.tsx (mẫu gốc đã làm đúng) vẫn giữ nguyên pattern — không bị đụng vào trong đợt sửa này", () => {
    const src = read("src/components/emr-command-center.tsx");
    expect(src).toContain("await r.json().catch(()=>null)");
  });
});
