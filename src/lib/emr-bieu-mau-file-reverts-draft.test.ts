import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Tự rà sau khi ship tính năng duyệt phát hành: /api/emr/items/[id]/file
// update() thẳng emr_rollout_items, KHÔNG đi qua PATCH /api/emr/items/[id]
// nên bỏ sót hoàn toàn logic "sửa nội dung tự đưa về Nháp" — đính kèm/thay/
// xoá file của 1 Biểu mẫu (chính nội dung biểu mẫu) lẽ ra cũng phải yêu cầu
// duyệt lại, giống hệt sửa title/description/details qua PATCH.
describe("EMR Biểu mẫu — tải lên/xoá file đính kèm cũng tự đưa biểu mẫu ĐÃ duyệt về Nháp", () => {
  const route = read("src/app/api/emr/items/[id]/file/route.ts");

  it("loadItem lấy thêm publish_status để biết có cần revert không", () => {
    expect(route).toContain('.select("id,organization_id,category,details,publish_status")');
  });

  it("chỉ revert khi category là BIEU_MAU và đang PUBLISHED — không đụng danh mục khác hay biểu mẫu đã Nháp sẵn", () => {
    expect(route).toContain('if (item.category !== "BIEU_MAU" || item.publish_status !== "PUBLISHED") return {};');
    expect(route).toContain('return { publish_status: "DRAFT", published_at: null, published_by: null };');
  });

  it("cả upload (POST) và xoá file (DELETE) đều áp dụng revertToDraftPatch trong cùng câu update()", () => {
    const postBody = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function GET"));
    const deleteBody = route.slice(route.indexOf("export async function DELETE"));
    expect(postBody).toContain("...revertToDraftPatch(item)");
    expect(deleteBody).toContain("...revertToDraftPatch(item)");
  });
});
