import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Yêu cầu: tách "Phạm vi áp dụng" ra khỏi modal thêm/sửa của riêng danh mục
// Khai báo biểu mẫu (BIEU_MAU) — thay bằng 1 nút trên toolbar (như "Tiến độ
// triển khai") mở ra ma trận: hàng là biểu mẫu, cột là khoa/phòng, tick =
// áp dụng. Các danh mục khác vẫn giữ fieldset inline như cũ.
describe("EMR Khai báo biểu mẫu — ma trận Phạm vi áp dụng tách khỏi modal", () => {
  const client = read("src/components/emr-category-client.tsx");

  it("có nút toolbar 'Phạm vi áp dụng' riêng cho BIEU_MAU, cạnh nút Tiến độ triển khai", () => {
    expect(client).toContain('categoryCode === "BIEU_MAU" ? <button type="button" className={`button ${view === "scope" ? "primary" : "tertiary"} small`} onClick={() => setView("scope")}>Phạm vi áp dụng</button> : null');
  });

  it("view state có thêm chế độ 'scope' bên cạnh info/progress", () => {
    expect(client).toContain('useState<"info" | "progress" | "scope">("info")');
  });

  it("render ma trận hàng=biểu mẫu, cột=khoa/phòng khi view==='scope'", () => {
    expect(client).toContain('view === "scope" ? (');
    expect(client).toContain("{departments.map((d) => <th key={d.id}>{d.short_name || d.name}</th>)}");
    expect(client).toContain("{filtered.map((item) => {");
  });

  it("tick/bỏ tick trong ma trận gọi PATCH department_ids cho đúng item, có cập nhật lạc quan + rollback khi lỗi", () => {
    expect(client).toContain("async function toggleScopeCell(item: Item, deptId: string)");
    expect(client).toContain('fetch(`/api/emr/items/${item.id}`, { method: "PATCH"');
    expect(client).toContain("setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, department_ids: next } : i)))");
    expect(client).toContain("await load({ silent: true });");
  });

  it("checkbox trong ô ma trận dùng .inline-check (không để input trần) và disable khi không có quyền quản lý", () => {
    expect(client).toContain('<span className="inline-check" style={{ justifyContent: "center" }}>');
    expect(client).toContain("disabled={!canManage}");
  });

  it("fieldset 'Khoa/phòng — Phạm vi áp dụng' inline trong modal KHÔNG còn hiện cho BIEU_MAU — chỉ các danh mục khác", () => {
    expect(client).toContain('{categoryCode !== "BIEU_MAU" ? (');
    expect(client).toContain("<legend>Khoa/phòng — Phạm vi áp dụng</legend>");
  });

  it("PATCH /api/emr/items/[id] (dùng để lưu từng ô) yêu cầu quyền emr.manage, không phải emr.view", () => {
    const route = read("src/app/api/emr/items/[id]/route.ts");
    const patchFn = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
    expect(patchFn).toContain('requireApiPermission("emr.manage")');
  });

  it("cùng 1 bảng 'Phạm vi áp dụng' còn có nhóm cột thứ 2: theo loại hồ sơ bệnh án (không hardcode lại options, lấy từ field record_types)", () => {
    expect(client).toContain('const recordTypeOptions = extraFields.find((f) => f.key === "record_types")?.options || [];');
    expect(client).toContain("{recordTypeOptions.map((rt) => <th key={rt}>{rt}</th>)}");
    expect(client).toContain("async function toggleRecordTypeCell(item: Item, typeValue: string)");
  });

  it("toggleRecordTypeCell gửi nguyên details hiện có kèm record_types mới (không gửi thiếu field khác)", () => {
    expect(client).toContain("const nextDetails = { ...item.details, record_types: next.join(\", \") };");
    expect(client).toContain('body: JSON.stringify({ details: nextDetails })');
  });

  it("record_types không còn render trong modal khai báo cho BIEU_MAU", () => {
    expect(client).toContain('!(categoryCode === "BIEU_MAU" && f.key === "record_types")');
  });
});
