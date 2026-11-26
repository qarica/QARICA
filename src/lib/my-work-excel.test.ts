import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMyWorkExcelHtml, escapeExcelHtml, myWorkExcelFileName, MY_WORK_EXCEL_HEADERS, type MyWorkExportRow } from "./my-work-excel";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const row = (o: Partial<MyWorkExportRow> = {}): MyWorkExportRow => ({
  title: "Nộp báo cáo <Quý 3> & \"minh chứng\"",
  type: "Note cá nhân",
  relatedTo: "—",
  createdAt: "01/11/2026",
  priority: "Cao",
  dueDate: "30/11/2026",
  completedAt: "—",
  status: "Đang thực hiện",
  note: "Chờ khoa A",
  ...o,
});

describe("xuất Excel Việc của tôi", () => {
  it("escape ký tự HTML trong mọi ô", () => {
    expect(escapeExcelHtml("<a href=\"x\">&'</a>")).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    const html = buildMyWorkExcelHtml([row()], "Tiêu đề <b>");
    expect(html).toContain("Nộp báo cáo &lt;Quý 3&gt; &amp; &quot;minh chứng&quot;");
    expect(html).not.toContain("<Quý 3>");
    expect(html).toContain("<caption>Tiêu đề &lt;b&gt;</caption>");
  });
  it("header đủ cột, STT đánh số từ 1, mỗi dòng đúng số ô", () => {
    const html = buildMyWorkExcelHtml([row(), row({ title: "Việc 2" })], "x");
    for (const h of MY_WORK_EXCEL_HEADERS) expect(html).toContain(`<th>${h}</th>`);
    const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    expect(rows).toHaveLength(3);
    expect(rows[1].startsWith("<td>1</td>")).toBe(true);
    expect(rows[2].startsWith("<td>2</td>")).toBe(true);
    for (const r of rows.slice(1)) expect((r.match(/<td>/g) || []).length).toBe(MY_WORK_EXCEL_HEADERS.length);
  });
  it("danh sách rỗng vẫn ra file có dòng thông báo (không lỗi)", () => {
    expect(buildMyWorkExcelHtml([], "x")).toContain(`<td colspan="${MY_WORK_EXCEL_HEADERS.length}">Không có việc phù hợp.</td>`);
  });
  it("tên file ASCII an toàn, có hậu tố tuần khi lọc tuần", () => {
    expect(myWorkExcelFileName("2026-11-26")).toBe("viec-cua-toi_2026-11-26.xls");
    expect(myWorkExcelFileName("2026-11-26", "2026-11-23")).toBe("viec-cua-toi_tuan-2026-11-23.xls");
    expect(myWorkExcelFileName("a/b", null)).not.toMatch(/[/\\ ]/);
  });
});

describe("trang Việc của tôi nối nút Xuất Excel vào đúng danh sách đang lọc", () => {
  const page = read("src/app/(app)/tasks/page.tsx");
  it("xuất toàn bộ weekScoped (đã lọc tab/tìm kiếm/tuần), không phải chỉ trang 10 dòng", () => {
    expect(page).toContain("const exportRows=weekScoped.map(");
    expect(page).not.toContain("tableRowsPage.map(r=>({title");
    expect(page).toContain("<MyWorkExportButton rows={exportRows} caption={exportCaption} todayKey={today} weekStart={weekStart}/>");
  });
  it("nút chạy ở trình duyệt, không thêm route/quyền mới", () => {
    const btn = read("src/components/my-work-export-button.tsx");
    expect(btn).toContain('"use client"');
    expect(btn).toContain('type="button"');
    expect(btn).toContain("URL.createObjectURL");
    expect(btn).toContain("application/vnd.ms-excel");
  });
});
