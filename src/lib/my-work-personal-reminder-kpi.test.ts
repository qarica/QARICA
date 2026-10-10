import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Báo cáo thực tế (ảnh chụp "Việc của tôi" trên mobile): note cá nhân "Soạn
// QT phối hợp giữa HDIII & UBSG" hạn 7/10/26 — đã quá hạn so với hôm nay
// 10/10/26 — nhưng KPI "Quá hạn" vẫn hiện 0. Nguyên nhân: kpiRows (nguồn
// tính overdue/dueToday/dueSoon/open) trước đây chỉ gộp Action
// (vw_actions_dashboard) + EMR, hoàn toàn bỏ qua personalReminders — dù
// chính secretaryHeadline bên dưới vẫn nói "Không có việc cá nhân quá hạn"
// khi overdue=0, tức trang tự coi note cá nhân là một phần của "quá hạn".
describe("Việc của tôi (/tasks) — KPI quá hạn/đến hạn/đang mở/hoàn thành phải tính cả note cá nhân", () => {
  const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("dựng personalReminderKpiRows từ personalReminders (dùng dateOnly, không cắt chuỗi trực tiếp) và gộp vào kpiRows", () => {
    expect(source).toContain("const personalReminderKpiRows=personalReminders.map((p:any)=>{const dueDate=p.due_at?dateOnly(p.due_at):null;const isOverdue=p.status===\"OPEN\"&&!!dueDate&&dueDate<today;");
    expect(source).toContain("const kpiRows=[...rows,...emrKpiRows,...personalReminderKpiRows];");
  });

  it("KPI Hoàn thành cũng tính note cá nhân đã COMPLETED, không chỉ Action", () => {
    expect(source).toContain('completed=rows.filter(r=>r.workflow_status==="COMPLETED").length+personalReminders.filter((p:any)=>p.status==="COMPLETED").length;');
  });

  it("personalReminderKpiRows khai báo SAU personalReminders/today/dateOnly (không rơi vào temporal dead zone như lỗi đã sửa trước đó)", () => {
    const prDeclIndex = source.indexOf("const rows=sourceRows.filter");
    const todayDeclIndex = source.indexOf("const today=hcmToday()");
    const dateOnlyDeclIndex = source.indexOf("function dateOnly");
    const useIndex = source.indexOf("personalReminderKpiRows=personalReminders.map");
    expect(prDeclIndex).toBeGreaterThan(-1);
    expect(todayDeclIndex).toBeGreaterThan(-1);
    expect(dateOnlyDeclIndex).toBeGreaterThan(-1);
    expect(useIndex).toBeGreaterThan(-1);
    expect(prDeclIndex).toBeLessThan(useIndex);
    expect(todayDeclIndex).toBeLessThan(useIndex);
    expect(dateOnlyDeclIndex).toBeLessThan(useIndex);
  });
});
