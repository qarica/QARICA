import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế: "Việc của tôi" chưa có lọc theo tuần để báo cáo công việc
// trong tuần. Thêm ?week=YYYY-MM-DD (mặc định KHÔNG lọc, giữ đúng hành vi cũ)
// — quy về đúng Thứ 2 của tuần chứa ngày đó, lọc theo completedAt ở tab Đã
// hoàn thành (báo cáo "đã làm gì trong tuần") và theo dueDate ở các tab khác.
const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

// Cùng kỹ thuật đã dùng ở emr-bieu-mau-tree-group-change-publish-status.test.ts:
// trích đúng thân hàm thuần từ source thật rồi biên dịch/chạy thật, không chỉ
// so khớp chuỗi — vì mondayOfWeek/addDays là hàm nội bộ của page.tsx (không
// export), không thể import trực tiếp theo quy ước test của repo này (không
// resolve alias "@/", và page.tsx kéo theo các import server-only).
function loadDateHelpers(): { mondayOfWeek: (d: string) => string; addDays: (d: string, n: number) => string } {
  const mondayMatch = source.match(/function mondayOfWeek\(dateStr:string\)\{.*\}/);
  const addDaysMatch = source.match(/function addDays\(dateStr:string,days:number\)\{.*\}/);
  if (!mondayMatch || !addDaysMatch) throw new Error("mondayOfWeek/addDays not found in page.tsx source");
  const js = ts.transpileModule(
    `${mondayMatch[0]}\n${addDaysMatch[0]}\nexport { mondayOfWeek, addDays };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const factory = new Function("exports", `${js}\nreturn exports;`);
  return factory({});
}

describe("Việc của tôi (/tasks) — lọc theo tuần để báo cáo công việc trong tuần", () => {
  it("mondayOfWeek quy mọi ngày trong tuần về đúng Thứ 2 (quy ước VN, không lệch sang tuần sau với Chủ nhật)", () => {
    const { mondayOfWeek } = loadDateHelpers();
    // 2026-10-15 là Thứ Năm (theo system reminder "Today's date is 2026-10-15").
    expect(mondayOfWeek("2026-10-15")).toBe("2026-10-12");
    expect(mondayOfWeek("2026-10-12")).toBe("2026-10-12"); // chính Thứ 2
    expect(mondayOfWeek("2026-10-18")).toBe("2026-10-12"); // Chủ nhật cùng tuần, không nhảy sang tuần sau
    expect(mondayOfWeek("2026-10-19")).toBe("2026-10-19"); // Thứ 2 tuần kế tiếp
  });

  it("addDays cộng/trừ đúng số ngày, xử lý đúng khi qua ranh giới tháng/năm", () => {
    const { addDays } = loadDateHelpers();
    expect(addDays("2026-10-12", 6)).toBe("2026-10-18"); // Thứ 2 -> Chủ nhật cùng tuần
    expect(addDays("2026-10-12", -7)).toBe("2026-10-05");
    expect(addDays("2026-10-12", 7)).toBe("2026-10-19");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("?week= mặc định KHÔNG lọc gì cả (weekStart/weekEnd null khi không truyền) — không đổi hành vi cũ", () => {
    expect(source).toContain("const rawWeekValue=String(rawWeek||\"\").trim();");
    expect(source).toContain('const weekStart=/^\\d{4}-\\d{2}-\\d{2}$/.test(rawWeekValue)&&!Number.isNaN(Date.parse(rawWeekValue))?mondayOfWeek(rawWeekValue):null;');
    expect(source).toContain("const weekScoped=weekStart&&weekEnd?searched.filter(");
  });

  it("ở tab DONE lọc theo completedAt (ngày hoàn thành thật) để ra đúng báo cáo \"đã làm gì trong tuần\", các tab khác lọc theo dueDate", () => {
    expect(source).toContain('const compareDate=tab==="DONE"?(r.completedAt||r.dueDate):r.dueDate;');
  });

  it("action hoàn thành dùng updated_at làm completedAt xấp xỉ (actions không có cột completed_at riêng)", () => {
    expect(source).toContain("completedAt:r.workflow_status===\"COMPLETED\"&&r.updated_at?dateOnly(r.updated_at):null,");
    expect(source).toContain(",updated_at\";"); // ACTION_SELECT phải kéo thêm updated_at
  });

  it("personal_reminders phải SELECT thêm completed_at để tính completedAt cho note cá nhân đã hoàn thành", () => {
    expect(source).toContain('.select("id,title,note,due_at,priority,status,completed_at")');
    expect(source).toContain('completedAt:p.status==="COMPLETED"&&p.completed_at?dateOnly(p.completed_at):null,');
  });

  it("chuyển tab / chuyển trang vẫn giữ nguyên tuần đang lọc (không bị reset khi bấm tab hay trang khác)", () => {
    expect(source).toContain('const tabHref=(t:string)=>`?tab=${t}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${weekStart?`&week=${weekStart}`:""}#all-work`;');
    expect(source).toContain('const pageHref=(p:number)=>`?tab=${tab}${searchQuery?`&q=${encodeURIComponent(searchQuery)}`:""}${weekStart?`&week=${weekStart}`:""}&page=${p}#all-work`;');
  });

  it("có điều hướng Tuần trước / Tuần này / Tuần sau / Bỏ lọc tuần", () => {
    expect(source).toContain("Tuần trước");
    expect(source).toContain("Tuần sau");
    expect(source).toContain("Tuần này");
    expect(source).toContain("Bỏ lọc tuần");
  });

  // Theo yêu cầu tiếp theo: báo cáo tuần phải trả lời thẳng "việc nào đã
  // xong, việc nào chưa xong" trong 1 lần nhìn, không phụ thuộc tab đang mở
  // (tab chỉ quyết định danh sách CHI TIẾT hiển thị bên dưới, không quyết
  // định 2 con số tổng này).
  it("tính weekDoneRows/weekPendingRows từ TOÀN BỘ allWorkRows, không phụ thuộc tab đang mở", () => {
    expect(source).toContain("const weekDoneRows=weekStart&&weekEnd?allWorkRows.filter(r=>r.isDone&&r.completedAt&&r.completedAt>=weekStart&&r.completedAt<=weekEnd):[];");
    expect(source).toContain("const weekPendingRows=weekStart&&weekEnd?allWorkRows.filter(r=>!r.isDone&&r.dueDate&&r.dueDate>=weekStart&&r.dueDate<=weekEnd):[];");
  });

  it("dòng báo cáo tuần hiện cả 2 số đã xong/chưa xong, mỗi số bấm vào mở đúng tab tương ứng (DONE/OPEN) kèm tuần đang chọn", () => {
    expect(source).toContain('const reportTabHref=(t:string)=>{const params=new URLSearchParams();params.set("tab",t);if(weekStart)params.set("week",weekStart);return `?${params.toString()}#all-work`};');
    expect(source).toContain('<Link href={reportTabHref("DONE")} className="week-report-link done"><strong>{weekDoneRows.length} đã xong</strong></Link>');
    expect(source).toContain('<Link href={reportTabHref("OPEN")} className="week-report-link pending"><strong>{weekPendingRows.length} chưa xong</strong></Link>');
  });

  // Báo cáo thực tế từ ảnh chụp: việc đã hoàn thành vẫn chỉ hiện hạn xử lý cũ
  // (vd "08/10/2026") thay vì ngày hoàn thành thật — không biết việc đó xong
  // lúc nào, trong khi đây chính là màn hình dùng để báo cáo việc đã xong
  // trong tuần. Cả bảng (desktop) lẫn thẻ (mobile) đều phải đổi sang hiện
  // "Hoàn thành: DD/MM/YYYY" cho việc đã xong.
  it("dueOrCompletedLabel hiện ngày hoàn thành thật cho việc đã xong, hạn xử lý cho việc chưa xong", () => {
    expect(source).toContain('function dueOrCompletedLabel(row:{isDone:boolean;completedAt:string|null;dueDate:string|null}){if(row.isDone)return row.completedAt?`Hoàn thành: ${formatDate(row.completedAt)}`:"Đã hoàn thành";return row.dueDate?formatDate(row.dueDate):"Không có hạn"}');
  });

  it("cả bảng desktop lẫn thẻ mobile đều dùng dueOrCompletedLabel thay vì chỉ hiện dueDate thô", () => {
    expect(source).toContain('<td className={r.isOverdue?"text-danger":r.isDone?"text-success":""}>{dueOrCompletedLabel(r)}</td>');
    expect(source).toContain('<small>{r.typeLabel} · {dueOrCompletedLabel(r)}</small>');
    expect(source).not.toContain('{r.dueDate?formatDate(r.dueDate):"Không có hạn"}');
    expect(source).not.toContain('{r.dueDate?formatDate(r.dueDate):"—"}');
  });
});
