import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORK_KANBAN_COLUMNS, addDaysIso, daysOverdue, groupWorkRows, workKanbanColumn } from "./my-work-kanban";

const TODAY = "2026-11-27";
const row = (over: Partial<{ dueDate: string | null; completedAt: string | null; isDone: boolean; isOverdue: boolean; followup: unknown; id: string }> = {}) => ({ id: "x", dueDate: null, completedAt: null, isDone: false, isOverdue: false, followup: null, ...over });

describe("Kanban Việc của tôi: phân cột theo hạn", () => {
  it("6 cột đúng thứ tự ưu tiên xử lý", () => {
    expect(WORK_KANBAN_COLUMNS.map((c) => c.key)).toEqual(["OVERDUE", "TODAY", "NEXT7", "LATER", "WAITING", "DONE"]);
  });
  it("mốc hạn: quá hạn / hôm nay / trong 7 ngày / xa hơn / không hạn", () => {
    expect(workKanbanColumn(row({ dueDate: "2026-11-26" }), TODAY)).toBe("OVERDUE");
    expect(workKanbanColumn(row({ dueDate: "2026-11-27" }), TODAY)).toBe("TODAY");
    expect(workKanbanColumn(row({ dueDate: "2026-11-28" }), TODAY)).toBe("NEXT7");
    expect(workKanbanColumn(row({ dueDate: "2026-12-04" }), TODAY)).toBe("NEXT7"); // đúng +7 ngày
    expect(workKanbanColumn(row({ dueDate: "2026-12-05" }), TODAY)).toBe("LATER");
    expect(workKanbanColumn(row({ dueDate: null }), TODAY)).toBe("LATER");
  });
  it("cờ quá hạn của nguồn việc được tôn trọng kể cả khi chưa có ngày", () => {
    expect(workKanbanColumn(row({ isOverdue: true, dueDate: "2026-12-30" }), TODAY)).toBe("OVERDUE");
  });
  it("đã xong luôn vào Hoàn thành (dù quá hạn); đang chờ phản hồi vào Chờ phản hồi (dù quá hạn)", () => {
    expect(workKanbanColumn(row({ isDone: true, dueDate: "2026-01-01", isOverdue: true }), TODAY)).toBe("DONE");
    expect(workKanbanColumn(row({ followup: { state: "WAITING", waiting_for_label: "Khoa Dược" }, dueDate: "2026-11-01", isOverdue: true }), TODAY)).toBe("WAITING");
    expect(workKanbanColumn(row({ followup: { state: "ACTIVE" }, dueDate: "2026-11-27" }), TODAY)).toBe("TODAY");
    expect(workKanbanColumn(row({ followup: "ghi chú chữ", dueDate: "2026-11-27" }), TODAY)).toBe("TODAY");
  });
  it("mỗi việc đúng một cột, không mất việc; sắp theo hạn tăng dần, xong thì mới nhất trước", () => {
    const rows = [
      row({ id: "a", dueDate: "2026-11-20" }), row({ id: "b", dueDate: "2026-11-10" }), row({ id: "c", dueDate: "2026-11-27" }),
      row({ id: "d", dueDate: "2026-12-01" }), row({ id: "e" }), row({ id: "f", dueDate: "2027-01-01" }),
      row({ id: "g", isDone: true, completedAt: "2026-11-01" }), row({ id: "h", isDone: true, completedAt: "2026-11-25" }),
      row({ id: "i", followup: { state: "WAITING" }, dueDate: "2026-11-30" }),
    ];
    const g = groupWorkRows(rows, TODAY);
    expect(Object.values(g).flat().length).toBe(rows.length);
    expect(g.OVERDUE.map((r) => r.id)).toEqual(["b", "a"]);
    expect(g.TODAY.map((r) => r.id)).toEqual(["c"]);
    expect(g.NEXT7.map((r) => r.id)).toEqual(["d"]);
    expect(g.LATER.map((r) => r.id)).toEqual(["f", "e"]); // có hạn trước, không hạn cuối
    expect(g.WAITING.map((r) => r.id)).toEqual(["i"]);
    expect(g.DONE.map((r) => r.id)).toEqual(["h", "g"]);
  });
  it("addDaysIso và daysOverdue", () => {
    expect(addDaysIso("2026-11-27", 7)).toBe("2026-12-04");
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysOverdue("2026-11-20", TODAY)).toBe(7);
    expect(daysOverdue("2026-11-27", TODAY)).toBe(0);
    expect(daysOverdue(null, TODAY)).toBe(0);
  });
});

describe("trang Việc của tôi: nút chuyển Danh sách / Kanban", () => {
  const page = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");
  const comp = readFileSync("src/components/my-work-kanban.tsx", "utf8");
  it("tham số view, nút chuyển, và Kanban dùng cùng danh sách đã lọc (weekScoped) với bảng", () => {
    expect(page).toContain('const view:"list"|"kanban"|"matrix"=rawViewKey==="kanban"?"kanban":rawViewKey==="matrix"?"matrix":"list"');
    expect(page).toContain("Kanban theo hạn");
    expect(page).toContain("const kanbanRows:MyWorkKanbanRow[]=weekScoped.map(");
    expect(page).toContain('view==="kanban"?<MyWorkKanban rows={kanbanRows} today={today}/>');
  });
  it("giữ view khi đổi tab, trang, tuần, báo cáo tuần và khi tìm kiếm", () => {
    for (const fn of ["const tabHref", "const pageHref", "const weekHref", "const reportTabHref"]) {
      const line = page.slice(page.indexOf(fn), page.indexOf("\n", page.indexOf(fn)));
      expect(line, fn).toMatch(/view/i);
    }
    expect(page).toContain('<input type="hidden" name="view" value={view}/>');
  });
  it("chỉ xem: không có kéo-thả hay hành động đổi trạng thái trong Kanban", () => {
    expect(comp).not.toMatch(/draggable|onDrop|onDragStart|onClick|"use client"/);
    expect(comp).toContain("<Link key={r.key} href={r.href}");
  });
  it("giới hạn thẻ mỗi cột có chỉ dẫn xem tiếp ở dạng Danh sách", () => {
    expect(comp).toContain("CARD_CAP = 30");
    expect(comp).toContain("xem ở dạng Danh sách");
  });
  it("giao diện dùng chung chuẩn trang: bảng/danh sách thẻ cũ vẫn có khi view=list", () => {
    expect(page).toContain('className="table-wrap all-table desktop-only"');
    expect(page).toContain('className="mobile-only work-card-list"');
    expect(page).toContain('className="work-pagination"');
  });
});

describe("bố cục Kanban: mọi cột đều thấy được, không phải cuộn ngang", () => {
  it("lưới tự xuống dòng (auto-fit) thay vì 6 cột cố định tràn khung; điện thoại 1 cột", () => {
    const page = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");
    expect(page).toContain(".kb-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr))");
    expect(page).not.toMatch(/\.kb-board\{[^}]*overflow-x:auto/);
    expect(page).toContain("@media(max-width:640px){.tqm-my-work .kb-board{grid-template-columns:1fr}}");
  });
});
