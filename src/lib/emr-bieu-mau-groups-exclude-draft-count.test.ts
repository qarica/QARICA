import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-bieu-mau-groups-client.tsx", "utf8");

// Tự rà sau khi "Cây biểu mẫu" đổi sang chỉ đếm biểu mẫu ĐÃ duyệt phát hành:
// "Quản lý nhóm gáy" (link ngay trên cùng trang Cây biểu mẫu) trước đó đếm
// MỌI biểu mẫu bất kể publish_status ở cột "Số biểu mẫu" — 2 màn hình liền
// kề hiện số khác nhau cho cùng 1 nhóm gáy, đúng kiểu "chưa đồng bộ" đã gặp
// ở Tổng quan EMR. Cột hiển thị đổi sang đếm ĐÃ DUYỆT (khớp Cây biểu mẫu),
// kèm số Nháp riêng nếu có; nút Xoá vẫn chặn theo TỔNG (kể cả Nháp) vì xoá
// nhóm vẫn làm mồ côi binding_group của biểu mẫu Nháp.
describe("EMR Quản lý nhóm gáy — cột 'Số biểu mẫu' khớp Cây biểu mẫu (chỉ đếm đã duyệt)", () => {
  it("Item có publish_status, tách publishedCountByName/draftCountByName thay vì 1 countByName gộp chung", () => {
    expect(client).toContain("type Item = { id: string; details: Record<string, unknown>; publish_status: string };");
    expect(client).toContain("const publishedCountByName = new Map<string, number>();");
    expect(client).toContain("const draftCountByName = new Map<string, number>();");
    expect(client).toContain('if (item.publish_status === "DRAFT") draftCountByName.set(key, (draftCountByName.get(key) || 0) + 1);');
  });

  it("cột hiển thị dùng publishedCount, kèm +N Nháp nếu có", () => {
    expect(client).toContain("<td>{publishedCount}{draftCount > 0 ? <div><small className=\"muted\">+{draftCount} Nháp</small></div> : null}</td>");
  });

  it("nút Xoá vẫn chặn theo totalCount (publishedCount + draftCount) — không cho xoá nhóm còn biểu mẫu Nháp trỏ tới", () => {
    expect(client).toContain("const totalCount = publishedCount + draftCount;");
    expect(client).toContain("disabled={busyId === group.id || totalCount > 0}");
    expect(client).toContain("onClick={() => deleteGroup(group, totalCount)}");
  });
});
