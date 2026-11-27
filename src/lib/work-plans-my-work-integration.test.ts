import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Đề xuất từ báo cáo kiểm thử menu (đã được duyệt): "gắn đầu việc (Kế
// hoạch công việc) vào Việc của tôi" — người phụ trách trước đây không thấy việc đó ở /tasks trừ khi tự
// vào module riêng kiểm tra.
describe("Việc của tôi: gộp đầu việc Kế hoạch công việc giao cho mình", () => {
  const page = read("src/app/(app)/tasks/page.tsx");

  it("chỉ lấy đầu việc có assignee_user_id là chính người đang xem", () => {
    expect(page).toContain('.eq("assignee_user_id",user.id)');
    expect(page).not.toContain("work_plan_item_raci");
  });

  it("loại CANCELLED, không loại DONE — đầu việc đã xong vẫn cần hiện ở tab Đã hoàn thành", () => {
    expect(page).toContain('.neq("status","CANCELLED")');
  });

  it("quy đổi eisenhower_quadrant (2 trục) sang thang priority 1 trục sẵn có để tái dùng đúng badge màu, không tạo badge riêng", () => {
    expect(page).toContain('function eisenhowerToPriority(quadrant?:string|null){if(quadrant==="P1")return"CRITICAL";if(quadrant==="P2")return"HIGH";if(quadrant==="P3")return"URGENT";return"LOW"}');
  });

  it("status DONE quy về COMPLETED trong danh sách thống nhất (các bộ lọc cùng nhận diện việc đã xong bằng isDone)", () => {
    expect(page).toContain('statusLabel:isDone?"COMPLETED":(isOverdue?"OVERDUE":item.status)');
  });

  it("tính vào đủ các nút lọc nhanh (Quá hạn/Hôm nay/7 ngày tới/Đã xong) vì cùng nằm trong allWorkRows", () => {
    expect(page).toContain("const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows,...unifiedWorkPlanRows,...unifiedIncomingRows];");
    expect(page).toContain("const allWorkRows=[...unifiedAssignedRows,...unifiedReminderRows]");
    expect(page).toContain("DONE:allWorkRows.filter(r=>r.isDone).length");
  });

  it("gộp vào unifiedAssignedRows (tab 'Việc được giao'), không lẫn với note cá nhân tự tạo", () => {
    expect(page).toContain("const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows,...unifiedWorkPlanRows,...unifiedIncomingRows];");
  });

  it("nhãn ghi rõ 'Phụ trách', liên kết về /work-plans", () => {
    expect(page).toContain('typeLabel:"Kế hoạch công việc · Phụ trách"');
    expect(page).toContain('href:"/work-plans",source:"work_plan"');
  });
});

// Đổi người phụ trách trực tiếp trong 1 request (PATCH), không cần xoá/tạo lại.
describe("Kế hoạch công việc: đổi người phụ trách trực tiếp", () => {
  it("UI có nút 'Đổi người phụ trách', chọn người mới rồi PATCH assignee_user_id", () => {
    const client = read("src/components/work-plans-client.tsx");
    expect(client).toContain("Đổi người phụ trách");
    expect(client).toContain('body: JSON.stringify({ assignee_user_id: transferPerson })');
    expect(client).toContain('method: "PATCH"');
  });
});
