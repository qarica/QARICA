import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Phản hồi người dùng (bảng Biểu mẫu): cột Tiêu đề bị bóp thành dải hẹp, chữ xuống
// dòng từng từ, trong khi các cột phụ lại giữ 1 dòng. Đảo lại: Tiêu đề có bề rộng
// tối thiểu đủ đọc; các cột còn lại (kể cả tiêu đề cột) được xuống dòng.
describe("EMR bảng danh mục: cột Tiêu đề không bị bóp, cột phụ được xuống dòng", () => {
  const client = read("src/components/emr-category-client.tsx");

  it("bảng chính có class emr-category-table; th và td của Tiêu đề cùng mang class emr-col-title", () => {
    expect(client).toContain('<table className="data-table emr-category-table">');
    expect(client).toContain('<th className="emr-col-title"><button type="button" onClick={cycleTitleSort}');
    expect(client).toContain('<td className="emr-col-title"><strong>{item.title}</strong></td>');
  });

  it("CSS: cột Tiêu đề có min-width, các cột khác white-space:normal (chỉ cột nút mở rộng giữ nowrap)", () => {
    expect(client).toContain(".emr-category-table th,.emr-category-table td{white-space:normal;overflow-wrap:break-word}");
    expect(client).toContain(".emr-category-table th.emr-col-title,.emr-category-table td.emr-col-title{min-width:280px;max-width:440px}");
    expect(client).toContain(".emr-category-table th:first-child,.emr-category-table td:first-child{white-space:nowrap}");
  });

  it("dùng thẻ <style> thường với selector có tiền tố riêng, KHÔNG dùng styled-jsx (CLAUDE.md gotcha)", () => {
    expect(client).not.toContain("<style jsx");
  });

  it("ma trận Phạm vi áp dụng vẫn giữ <table className=\"data-table\"> trần (không bị ảnh hưởng)", () => {
    expect(client).toContain('<table className="data-table">');
  });
});
