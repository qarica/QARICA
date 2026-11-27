import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workKanbanColumn } from "./my-work-kanban";

// Lỗi gốc (báo cáo thực tế): note cá nhân hạn 7/10 đã quá hạn nhưng số "Quá hạn" vẫn hiện 0 vì bộ đếm chỉ gộp Action.
// Thiết kế mới bỏ 5 thẻ số: các nút lọc nhanh (Quá hạn/Hôm nay/7 ngày tới/Chờ phản hồi/Đã xong) đếm từ CÙNG danh sách thống nhất
// allWorkRows (Action + EMR + kế hoạch + việc cá nhân) và dùng đúng hàm phân cột của Kanban, nên mọi nguồn đều được tính.
describe("Việc của tôi (/tasks) — số đếm lọc nhanh phải tính cả việc cá nhân", () => {
  const source = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("việc cá nhân vào danh sách thống nhất với ngày hạn quy đổi bằng dateOnly (không cắt chuỗi trực tiếp)", () => {
    expect(source).toContain("dueDate:p.due_at?dateOnly(p.due_at):null");
    expect(source).toContain("const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows]");
  });

  it("số đếm các nút lọc nhanh tính từ allWorkRows bằng workKanbanColumn (cùng cách xếp cột với Kanban)", () => {
    for (const key of ["OVERDUE", "TODAY", "NEXT7"]) expect(source).toContain(`${key}:allWorkRows.filter(r=>workKanbanColumn(r,today)==="${key}").length`);
    expect(source).toContain('DONE:allWorkRows.filter(r=>r.isDone).length');
  });

  it("note cá nhân quá hạn 7/10 so với hôm nay 10/10 được tính vào Quá hạn; đã COMPLETED tính vào Đã xong", () => {
    const today = "2026-10-10";
    expect(workKanbanColumn({ dueDate: "2026-10-07", completedAt: null, isDone: false, isOverdue: true }, today)).toBe("OVERDUE");
    expect(workKanbanColumn({ dueDate: "2026-10-07", completedAt: "2026-10-08", isDone: true, isOverdue: false }, today)).toBe("DONE");
  });

  it("colCounts khai báo SAU allWorkRows và today (không rơi vào temporal dead zone)", () => {
    const todayDecl = source.indexOf("const today=hcmToday()");
    const allRowsDecl = source.indexOf("const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows]");
    const use = source.indexOf("const colCounts=");
    expect(todayDecl).toBeGreaterThan(-1);
    expect(allRowsDecl).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(allRowsDecl);
    expect(use).toBeGreaterThan(todayDecl);
  });

  it("5 thẻ số, khối Việc cần làm trước và khối thông báo trùng đã được bỏ", () => {
    expect(source).not.toContain('<section className="kpis">');
    expect(source).not.toContain("secretaryQueue");
    expect(source).not.toContain("attentionTitle");
    expect(source).not.toContain("my-work-quote");
  });
});
