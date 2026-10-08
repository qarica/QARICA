import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/emr-category-client.tsx", "utf8");
const route = readFileSync("src/app/api/emr/options/route.ts", "utf8");

// Yêu cầu: "Ẩn luôn các phòng không phải là Khoa trong bảng này" — ma trận
// "Phạm vi áp dụng" chỉ nói về việc biểu mẫu dùng ở Khoa nào; Phòng (quản
// lý/hỗ trợ, vd Ban Giám đốc, Phòng CNTT...) không có hoạt động lâm sàng nên
// không bao giờ là nơi áp dụng biểu mẫu bệnh án — trước đây bảng vẫn hiện cả
// Phòng làm cột, khiến "Chọn tất cả khoa" cũng vô tình tick luôn cả Phòng.
// Dùng đúng tiêu chí loại trừ (MANAGEMENT/SUPPORT) đã thống nhất với KPI
// "Khoa đã Go-live" ở emr-command-center.tsx — chỉ áp dụng cho MA TRẬN này;
// fieldset "Khoa/phòng — Phạm vi áp dụng" ở modal tạo/sửa (danh mục khác
// BIEU_MAU) và "Đơn vị phụ trách" vẫn hiện đủ Khoa lẫn Phòng.
describe("EMR Phạm vi áp dụng — chỉ hiện Khoa, ẩn Phòng (MANAGEMENT/SUPPORT)", () => {
  it("route /api/emr/options trả thêm department_type để client lọc được", () => {
    expect(route).toContain('.select("id,name,short_name,department_type")');
  });

  it("client tính clinicalDepartments loại Phòng, khoa chưa phân loại (null) vẫn được tính là Khoa", () => {
    expect(client).toContain('const NON_CLINICAL_DEPARTMENT_TYPES = useMemo(() => new Set(["MANAGEMENT", "SUPPORT"]), []);');
    expect(client).toContain("const clinicalDepartments = useMemo(");
    expect(client).toContain('(d) => !NON_CLINICAL_DEPARTMENT_TYPES.has((d.department_type || "").trim().toUpperCase())');
  });

  it("ma trận (colgroup, 2 dòng header, ô checkbox mỗi hàng) dùng clinicalDepartments, không phải departments đầy đủ", () => {
    const scopeBlock = client.slice(client.indexOf('view === "scope" ? ('), client.indexOf('view === "scope" ? (') + 4000);
    expect(scopeBlock).toContain("{clinicalDepartments.map((d) => <col key={d.id} />)}");
    expect(scopeBlock).toContain("{clinicalDepartments.length ? <th colSpan={clinicalDepartments.length}>Theo khoa</th> : null}");
    expect(scopeBlock).toContain('{clinicalDepartments.map((d) => <th key={d.id} className="emr-scope-col-head">{d.short_name || d.name}</th>)}');
    expect(scopeBlock).toContain("{clinicalDepartments.map((d) => {");
  });

  it("'Chọn tất cả khoa' và bỏ tick từng ô chỉ thao tác trên Khoa, không vô tình gán luôn Phòng", () => {
    expect(client).toContain("const next = clinicalDepartments.map((d) => d.id);");
    expect(client).toContain("const next = toggleId(item.department_ids, deptId);");
  });

  it("fieldset 'Khoa/phòng — Phạm vi áp dụng' (modal, danh mục khác BIEU_MAU) và 'Đơn vị phụ trách' vẫn dùng departments đầy đủ (Khoa lẫn Phòng)", () => {
    expect(client).toContain("<legend>Khoa/phòng — Phạm vi áp dụng</legend>");
    expect(client).toContain("{departments.map((d) => (");
    expect(client).toContain("{departments.map(d=><option key={d.id} value={d.id}>{d.short_name||d.name}</option>)}");
  });
});
