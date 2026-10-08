import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phản hồi người dùng trên bản đã deploy: (1) header + cột "Biểu mẫu" phải cố
// định khi cuộn ngang/dọc, (2) 2 ma trận (khoa/phòng, loại hồ sơ) phải gộp về
// 1 bảng duy nhất (1 thanh cuộn), (3) cần 1 nút "chọn tất cả khoa" mỗi hàng.
describe("EMR Phạm vi áp dụng — gộp 1 bảng + sticky header/cột + chọn tất cả khoa", () => {
  const client = read("src/components/emr-category-client.tsx");

  it("2 ma trận gộp vào đúng 1 <table>, không còn 2 section .panel tách rời", () => {
    const scopeBlock = client.slice(client.indexOf('view === "scope" ? ('), client.indexOf('view === "scope" ? (') + 4000);
    expect((scopeBlock.match(/<table className="data-table">/g) || []).length).toBe(1);
    expect(scopeBlock).toContain("Theo khoa/phòng");
    expect(scopeBlock).toContain("Theo loại hồ sơ bệnh án");
  });

  it("header 2 dòng dùng position:sticky theo top, cột Biểu mẫu dùng position:sticky theo left", () => {
    expect(client).toContain(".emr-scope-matrix thead th{position:sticky;top:0");
    expect(client).toContain(".emr-scope-matrix td.emr-scope-row-head,.emr-scope-matrix th.emr-scope-corner{position:sticky;left:0");
  });

  it("mỗi hàng có nút 'Chọn tất cả khoa' gọi đúng hàm tick hết department_ids cho item đó", () => {
    expect(client).toContain("async function selectAllDepartmentsForItem(item: Item)");
    expect(client).toContain("Chọn tất cả khoa");
    expect(client).toContain("const next = departments.map((d) => d.id);");
  });
});

describe("Topbar: bỏ hiển thị tên bệnh viện (yêu cầu tường minh)", () => {
  const shell = read("src/components/app-shell.tsx");
  it("không còn span .org-pill hiện organization.name trong topbar", () => {
    expect(shell).not.toContain("org-pill");
    expect(shell).not.toContain("organization?.name ? <span");
  });
});
