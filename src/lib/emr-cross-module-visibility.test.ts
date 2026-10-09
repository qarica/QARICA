import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Explicit request, from the perspective of a staff member who handles both
// QLCL and EMR: "có nên liên kết... để quản lý chung... phần việc của tôi
// là có nên tích hợp với EMR hay là lịch gì không". Recommendation: keep
// EMR's own data model and Go-live gate logic separate (CLAUDE.md principle
// 3), but surface EMR items that have an owner + due date in the two
// cross-module aggregator views that already exist for every other module
// — "Việc của tôi" and "Lịch QLCL" — reading emr_rollout_items directly
// (no duplicate/copied table).
describe("EMR items surface in Lịch QLCL (calendar) as their own event kind", () => {
  const calendar = readFileSync("src/app/(app)/calendar/page.tsx", "utf8");

  it("declares an EMR event kind and label alongside the existing ones", () => {
    expect(calendar).toContain('type EventKind = "ACTION" | "PROGRAM" | "MONITORING" | "ASSESSMENT" | "REPORT" | "INSPECTION" | "RECURRING" | "REMINDER" | "EMR";');
    expect(calendar).toContain('EMR: "Dự án EMR"');
  });

  it("fetches emr_rollout_items directly (no duplicate table), gated behind emr.view", () => {
    expect(calendar).toContain('hasPermission(user, "emr.view")');
    expect(calendar).toContain('.from("emr_rollout_items").select("id,category,title,status,due_date,priority,publish_status")');
  });

  // Báo cáo thực tế "Tổng quan EMR chưa đồng bộ": Biểu mẫu còn Nháp (chưa
  // duyệt phát hành) chưa được coi là đang triển khai chính thức — không nên
  // hiện "Đang triển khai/Quá hạn triển khai" trên lịch chung cho hạng mục
  // còn chưa duyệt, nhất quán với Tổng quan EMR và nhắc hạn.
  it("loại Biểu mẫu còn Nháp khỏi lịch — chưa duyệt phát hành thì chưa coi là đang triển khai", () => {
    expect(calendar).toContain('if (item.category === "BIEU_MAU" && item.publish_status === "DRAFT") continue;');
  });

  it("marks an EMR item overdue/due-today the same way every other kind on this calendar does", () => {
    expect(calendar).toContain('const overdue = open && item.due_date < today;');
    expect(calendar).toContain('const dueToday = open && item.due_date === today;');
  });

  it("links each EMR event to its real category page, not a dead link", () => {
    expect(calendar).toContain('href: category ? `/emr/${category.slug}` : "/emr"');
  });

  it("has its own distinct color so it doesn't visually collide with an existing kind", () => {
    expect(calendar).toContain(".calendar-dot.emr{background:#4f46e5}");
    expect(calendar).toContain(".calendar-event.emr{border-left-color:#4f46e5");
  });
});

describe("EMR items surface in Việc của tôi (My Work), scoped to the viewer's own department", () => {
  const tasks = readFileSync("src/app/(app)/tasks/page.tsx", "utf8");

  it("fetches open, due-dated emr_rollout_items directly, gated behind emr.view", () => {
    expect(tasks).toContain('hasPermission(user,"emr.view")');
    expect(tasks).toContain('.from("emr_rollout_items").select("id,category,title,status,due_date,priority,owner_department_id,department_ids,publish_status")');
    expect(tasks).toContain('.neq("status","DONE")');
  });

  // EMR items are scoped to a department (owner_department_id / department_ids),
  // not a specific assignee user like Action — "my work" for EMR means "my
  // department's open EMR items", filtered client-side like the EMR
  // dashboard route already does for the same array-column reason.
  it("scopes to the viewer's own department — owner or member of department_ids — not every item in the org", () => {
    expect(tasks).toContain("item.owner_department_id===user.primaryDepartmentId||item.department_ids?.includes(user.primaryDepartmentId)");
  });

  it("loại Biểu mẫu còn Nháp khỏi 'Việc của tôi' — chưa duyệt phát hành thì chưa coi là đang triển khai", () => {
    expect(tasks).toContain('!(item.category==="BIEU_MAU"&&item.publish_status==="DRAFT")');
  });

  it("folds EMR rows into the unified work list, the Đã giao tab, and the top KPI counts", () => {
    expect(tasks).toContain("const unifiedEmrRows:UnifiedRow[]=myEmrItems.map");
    expect(tasks).toContain("const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows];");
    expect(tasks).toContain("const kpiRows=[...rows,...emrKpiRows];");
  });

  it("an EMR row links to its real category page, not a dead /tasks/undefined link", () => {
    expect(tasks).toContain("href:category?`/emr/${category.slug}`:\"/emr\",source:\"emr\"");
  });
});
