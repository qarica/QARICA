import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-category-client.tsx", "utf8");

// Yêu cầu thực tế: "Bổ sung nút lọc biểu mẫu đã phát hành và chờ duyệt phát
// hành" — 3 nút lọc (Tất cả/Đã phát hành/Chờ duyệt phát hành) trên thanh
// công cụ của Biểu mẫu, chỉ áp dụng category BIEU_MAU (danh mục khác không
// có khái niệm duyệt phát hành).
describe("EMR Biểu mẫu — nút lọc Đã phát hành / Chờ duyệt phát hành", () => {
  it("state publishFilter mặc định ALL, chỉ 3 giá trị hợp lệ", () => {
    expect(client).toContain('const [publishFilter, setPublishFilter] = useState<"ALL" | "PUBLISHED" | "DRAFT">("ALL");');
  });

  it("3 nút lọc chỉ hiện cho BIEU_MAU, đổi state đúng giá trị tương ứng", () => {
    expect(client).toContain('categoryCode === "BIEU_MAU" ? (');
    expect(client).toContain('onClick={() => setPublishFilter("ALL")}>Tất cả</button>');
    expect(client).toContain('onClick={() => setPublishFilter("PUBLISHED")}>Đã phát hành</button>');
    expect(client).toContain('onClick={() => setPublishFilter("DRAFT")}>Chờ duyệt phát hành</button>');
  });

  it("`filtered` áp dụng publishFilter theo đúng publish_status, chỉ khi BIEU_MAU — không ảnh hưởng danh mục khác", () => {
    expect(client).toContain('if (categoryCode === "BIEU_MAU" && publishFilter !== "ALL") rows = rows.filter((i) => i.publish_status === publishFilter);');
  });

  it("thông báo rỗng phân biệt đúng nguyên nhân — do search hay do bộ lọc duyệt phát hành, không luôn đổ lỗi cho ô tìm kiếm", () => {
    expect(client).toContain('publishFilter === "PUBLISHED" ? "Chưa có biểu mẫu nào đã phát hành."');
    expect(client).toContain('publishFilter === "DRAFT" ? "Không còn biểu mẫu nào chờ duyệt phát hành."');
  });
});
