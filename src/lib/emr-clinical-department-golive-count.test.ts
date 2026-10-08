import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện: KPI "Khoa đã Go-live" (vd "0/34") đang đếm TẤT CẢ đơn vị đang
// hoạt động (cả Khoa lâm sàng lẫn Phòng quản lý/hỗ trợ như Ban Giám đốc) vì
// route dashboard không lấy department_type và client không lọc theo đó.
// Yêu cầu: KPI này chỉ tính Khoa (lâm sàng/cận lâm sàng), không tính Phòng.
// Bảng "Tình trạng triển khai EMR theo khoa/phòng" bên dưới KHÔNG lọc — đúng
// theo tên gọi "khoa/phòng" của chính nó, vẫn hiện đủ mọi đơn vị.
describe("EMR dashboard — KPI 'Khoa đã Go-live' chỉ đếm Khoa, không đếm Phòng (Ban Giám đốc, Phòng Kế hoạch,...)", () => {
  const route = read("src/app/api/emr/dashboard/route.ts");
  const client = read("src/components/emr-command-center.tsx");

  it("route lấy department_type và gắn vào từng dòng departmentMatrix", () => {
    expect(route).toContain('.select("id,name,short_name,department_type")');
    expect(route).toContain("department_type:d.department_type");
  });

  it("client loại Phòng (MANAGEMENT/SUPPORT) khỏi mẫu số/tử số KPI Khoa đã Go-live, khoa chưa phân loại (null) vẫn được tính", () => {
    expect(client).toContain('const NON_CLINICAL_DEPARTMENT_TYPES=new Set(["MANAGEMENT","SUPPORT"]);');
    expect(client).toContain('function isClinicalDepartment(d:Dept){return !NON_CLINICAL_DEPARTMENT_TYPES.has(d.department_type||"");}');
    expect(client).toContain("const clinicalDepartments=data.departmentMatrix.filter(isClinicalDepartment);");
    expect(client).toContain("const totalDepartmentsWithData=clinicalDepartments.length;");
    expect(client).toContain("const liveDepartments=clinicalDepartments.filter(d=>d.total>0&&d.completion===100).length;");
  });

  it("bảng ma trận theo khoa/phòng (data.departmentMatrix đầy đủ, không qua clinicalDepartments) vẫn hiện đủ Khoa lẫn Phòng", () => {
    expect(client).toContain("data.departmentMatrix.length?");
    expect(client).toContain("data.departmentMatrix.slice(0,10).map(");
  });
});
