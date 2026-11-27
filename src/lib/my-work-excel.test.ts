import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMyWorkSheet, myWorkExcelFileName, MY_WORK_EXCEL_HEADERS, type MyWorkExportRow } from "./my-work-excel";

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

describe("xuất Excel Việc của tôi (.xlsx thật)", () => {
  it("trang tính có tiêu đề, tên cột, STT là số, mỗi dòng đúng số ô", () => {
    const sheet = buildMyWorkSheet([row(), row({ title: "Việc 2" })], "Tiêu đề");
    expect(sheet.data).toHaveLength(4);
    expect(sheet.data[0][0].value).toBe("Tiêu đề");
    expect(sheet.data[1].map((c: any) => c.value)).toEqual(MY_WORK_EXCEL_HEADERS);
    expect(sheet.data[2][0]).toEqual({ value: 1, type: Number });
    expect(sheet.data[3][0]).toEqual({ value: 2, type: Number });
    for (const r of sheet.data.slice(2)) expect(r).toHaveLength(MY_WORK_EXCEL_HEADERS.length);
    expect(sheet.columns).toHaveLength(MY_WORK_EXCEL_HEADERS.length);
  });
  it("danh sách rỗng vẫn ra file có dòng thông báo (không lỗi)", () => {
    expect(buildMyWorkSheet([], "x").data[2][0].value).toBe("Không có việc phù hợp.");
  });
  it("ghi ra file .xlsx thật (gói zip bắt đầu bằng PK) đọc lại được", async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/node");
    const buf = await writeXlsxFile([buildMyWorkSheet([row()], "x")] as never).toBuffer();
    expect(Buffer.from(buf).subarray(0, 2).toString()).toBe("PK");
  });
  it("tên file ASCII an toàn .xlsx, có hậu tố tuần khi lọc tuần", () => {
    expect(myWorkExcelFileName("2026-11-26")).toBe("viec-cua-toi_2026-11-26.xlsx");
    expect(myWorkExcelFileName("2026-11-26", "2026-11-23")).toBe("viec-cua-toi_tuan-2026-11-23.xlsx");
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
    expect(btn).toContain("write-excel-file/browser");
    expect(btn).not.toContain("application/vnd.ms-excel");
  });
});
