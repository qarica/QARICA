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
    expect(client).toContain('function isClinicalDepartment(d:Dept){return !NON_CLINICAL_DEPARTMENT_TYPES.has((d.department_type||"").trim().toUpperCase());}');
    expect(client).toContain("const clinicalDepartments=data.departmentMatrix.filter(isClinicalDepartment);");
    expect(client).toContain("const totalDepartmentsWithData=clinicalDepartments.length;");
    expect(client).toContain("const liveDepartments=clinicalDepartments.filter(d=>d.total>0&&d.completion===100).length;");
  });

  // Phát hiện tiếp theo (báo cáo thực tế: "Vẫn còn đếm ban giám đốc" sau khi
  // đã đổ đúng department_type='MANAGEMENT' cho Ban Giám đốc trong Admin >
  // Khoa/Phòng): so khớp chuỗi tuyệt đối "MANAGEMENT"/"SUPPORT" bỏ sót dữ
  // liệu lệch hoa-thường hoặc dính khoảng trắng (khai báo trước khi field
  // department_type tồn tại, qua import/migration cũ) — chuẩn hoá
  // trim+toUpperCase trước khi so khớp để không phụ thuộc vào việc dữ liệu
  // luôn sạch tuyệt đối.
  it("so khớp department_type không phân biệt hoa-thường và bỏ khoảng trắng thừa, phòng dữ liệu cũ lệch định dạng", () => {
    const fn = client.match(/function isClinicalDepartment\(d:Dept\)\{return ([^}]+);\}/)?.[1] || "";
    expect(fn).toContain(".trim()");
    expect(fn).toContain(".toUpperCase()");
    const isClinicalDepartment = (departmentType: string | null) => {
      const type = (departmentType || "").trim().toUpperCase();
      return !new Set(["MANAGEMENT", "SUPPORT"]).has(type);
    };
    expect(isClinicalDepartment("management")).toBe(false);
    expect(isClinicalDepartment(" MANAGEMENT ")).toBe(false);
    expect(isClinicalDepartment("Support")).toBe(false);
    expect(isClinicalDepartment("CLINICAL")).toBe(true);
    expect(isClinicalDepartment(null)).toBe(true);
  });

  it("bảng ma trận theo khoa/phòng (data.departmentMatrix đầy đủ, không qua clinicalDepartments) vẫn hiện đủ Khoa lẫn Phòng", () => {
    expect(client).toContain("data.departmentMatrix.length?");
    expect(client).toContain("data.departmentMatrix.slice(0,10).map(");
  });
});
