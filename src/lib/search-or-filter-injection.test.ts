import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// GET /api/search chỉ escape wildcard ILIKE (%, _) rồi nhúng thẳng chuỗi tìm
// kiếm vào .or() thô — nhưng cú pháp .or() của PostgREST dùng dấu phẩy để
// NGĂN CÁCH nhiều điều kiện lọc. Một q chứa dấu phẩy (vd
// "x,lifecycle_status.eq.ARCHIVED" hoặc "x,record_type.eq.CAPA") có thể
// CHÈN THÊM điều kiện OR tùy ý trên bảng records — vẫn bị khoanh trong
// organization_id của người gọi (.eq ở ngoài AND với cả nhóm .or, nên không
// lộ chéo tổ chức), nhưng vẫn là input không được trung hòa đúng trước khi
// dựng câu lọc, cho phép dò/lọc theo cột khác ngoài title/record_code mà
// giao diện tìm kiếm không cho phép.
describe("GET /api/search — giá trị tìm kiếm không còn phá cú pháp .or() của PostgREST", () => {
  const source = readFileSync("src/app/api/search/route.ts", "utf8");

  it("bọc giá trị ilike trong dấu nháy kép kiểu PostgREST (escape \\ và \") trước khi đưa vào .or()", () => {
    expect(source).toContain("const orQuoted = (value: string) => `\"${value.replace(/\\\\/g, \"\\\\\\\\\").replace(/\"/g, '\\\\\"')}\"`;");
    expect(source).toContain(".or(`title.ilike.${pattern},record_code.ilike.${pattern}`)");
  });

  it("vẫn escape wildcard ILIKE (%, _) và cả dấu \\ của chính phần escape đó trước khi bọc nháy kép", () => {
    expect(source).toContain("const ilikeEscaped = q.replace(/[\\\\%_]/g, (m) => `\\\\${m}`);");
  });
});
