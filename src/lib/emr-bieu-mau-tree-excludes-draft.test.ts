import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-bieu-mau-tree-client.tsx", "utf8");
const page = readFileSync("src/app/(app)/emr/bieu-mau/tree/page.tsx", "utf8");

// Yêu cầu thực tế: "E rà lại cây biểu mẫu, các biểu mẫu chưa được duyệt thì
// gỡ ra" — Cây biểu mẫu chỉ nên dựng cây từ các biểu mẫu ĐÃ duyệt phát hành,
// đúng nguyên tắc "sau khi duyệt mới triển khai, áp dụng". Biểu mẫu Nháp vẫn
// đổi được nhóm gáy/thứ tự qua PATCH (field này không bị gate publish_status
// chặn) nhưng không nên xuất hiện ở cây cho tới khi được duyệt.
describe("EMR Cây biểu mẫu — gỡ biểu mẫu chưa duyệt phát hành (Nháp) khỏi cây", () => {
  it("TreeItem có publish_status, dựng groupMap từ publishedItems (đã lọc Nháp), không phải items thô", () => {
    expect(client).toContain("type TreeItem = { id: string; title: string; status: string; details: Record<string, unknown>; publish_status: string };");
    expect(client).toContain('const publishedItems = items.filter((i) => i.publish_status !== "DRAFT");');
    expect(client).toContain("for (const item of publishedItems) {");
  });

  it("hiện số lượng biểu mẫu Nháp bị gỡ, kèm hướng dẫn đi duyệt ở đâu — không âm thầm biến mất", () => {
    expect(client).toContain('const draftCount = items.filter((i) => i.publish_status === "DRAFT").length;');
    expect(client).toContain("biểu mẫu chưa duyệt phát hành (Nháp) không hiển thị ở đây");
  });

  it("mô tả đầu trang phản ánh đúng — chỉ biểu mẫu ĐÃ duyệt, không còn nói 'Toàn bộ biểu mẫu đã khai báo'", () => {
    expect(page).toContain("Các biểu mẫu ĐÃ duyệt phát hành");
    expect(page).not.toContain("Toàn bộ biểu mẫu đã khai báo");
  });
});
