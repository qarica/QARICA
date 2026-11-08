import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Đề xuất từ báo cáo kiểm thử menu (đã được duyệt): "gắn đầu việc RACI (Kế
// hoạch công việc) vào Việc của tôi" — người được gán R (thực hiện) hoặc A
// (chịu trách nhiệm chính) trước đây không thấy việc đó ở /tasks trừ khi tự
// vào module riêng kiểm tra.
describe("Việc của tôi: gộp đầu việc Kế hoạch công việc được gán R/A cho mình", () => {
  const page = read("src/app/(app)/tasks/page.tsx");

  it("chỉ lấy đầu việc gán vai trò R hoặc A cho chính người đang xem (không lấy C/I — đó là vai trò tham vấn/nhận thông tin, không phải người phải tự hoàn thành)", () => {
    expect(page).toContain('await supabase.from("work_plan_item_raci").select("work_plan_item_id,raci_role").eq("user_id",user.id).in("raci_role",["R","A"]);');
  });

  it("loại CANCELLED, không loại DONE — đầu việc đã xong vẫn cần hiện ở tab Đã hoàn thành", () => {
    expect(page).toContain('.neq("status","CANCELLED")');
  });

  it("quy đổi eisenhower_quadrant (2 trục) sang thang priority 1 trục sẵn có để tái dùng đúng badge màu, không tạo badge riêng", () => {
    expect(page).toContain('function eisenhowerToPriority(quadrant?:string|null){if(quadrant==="P1")return"CRITICAL";if(quadrant==="P2")return"HIGH";if(quadrant==="P3")return"URGENT";return"LOW"}');
  });

  it("status DONE quy về COMPLETED trong cả KPI và danh sách (open-KPI loại trừ đúng chữ COMPLETED, không loại DONE)", () => {
    expect(page).toContain('workflow_status:isDone?"COMPLETED":item.status');
    expect(page).toContain('statusLabel:isDone?"COMPLETED":(isOverdue?"OVERDUE":item.status)');
  });

  it("tính vào đủ cả 5 KPI đầu trang (kpiRows) và số đếm Hoàn thành", () => {
    expect(page).toContain("const kpiRows=[...rows,...emrKpiRows,...personalReminderKpiRows,...workPlanItemKpiRows];");
    expect(page).toContain('completed=rows.filter(r=>r.workflow_status==="COMPLETED").length+personalReminders.filter((p:any)=>p.status==="COMPLETED").length+myWorkPlanItems.filter((i:any)=>i.status==="DONE").length');
  });

  it("gộp vào unifiedAssignedRows (tab 'Việc được giao'), không lẫn với note cá nhân tự tạo", () => {
    expect(page).toContain("const unifiedAssignedRows=[...unifiedActionRows,...unifiedEmrRows,...unifiedWorkPlanRows];");
  });

  it("nhãn hiện rõ vai trò RACI của người xem (Thực hiện / Chịu trách nhiệm chính), liên kết về /work-plans", () => {
    expect(page).toContain('typeLabel:`Kế hoạch công việc${role==="A"?" · Chịu trách nhiệm chính":role==="R"?" · Thực hiện":""}`,');
    expect(page).toContain('href:"/work-plans",source:"work_plan"');
  });
});

// Đề xuất 2 (đã duyệt): "chưa có thao tác đổi người A trực tiếp — phải
// xoá/tạo lại (2 bước)".
describe("Kế hoạch công việc: chuyển giao người A (Accountable) trực tiếp, không cần xoá rồi gán lại", () => {
  it("API POST raci chấp nhận replace_existing: true khi đã có người A, chuyển giao trong 1 request", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/raci/route.ts");
    expect(route).toContain("const replaceExisting = body.replace_existing === true;");
    expect(route).toContain("if (!replaceExisting) {");
    expect(route).toContain('return NextResponse.json({ error: "Người này đã là người chữ A của đầu việc." }, { status: 400 });');
  });

  it("có bù trừ khôi phục người A cũ nếu gán người mới thất bại (không để đầu việc tạm thời thiếu người A)", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/raci/route.ts");
    expect(route).toContain("// Bù trừ: khôi phục người A cũ nếu gán người mới thất bại");
    expect(route).toContain('user_id: existingA.user_id, raci_role: "A" });');
  });

  it("hành vi cũ (không gửi replace_existing) vẫn báo lỗi yêu cầu xoá A hiện tại trước — không phá vỡ tương thích ngược", () => {
    const route = read("src/app/api/work-plans/[id]/items/[itemId]/raci/route.ts");
    expect(route).toContain("Đầu việc đã có người chữ A — xoá vai trò A hiện tại trước khi gán người khác, hoặc chuyển giao trực tiếp.");
  });

  it("UI có nút 'Chuyển giao A' chỉ hiện khi đầu việc đã có người A, chọn người mới rồi gọi đúng API với replace_existing: true", () => {
    const client = read("src/components/work-plans-client.tsx");
    expect(client).toContain('item.raci.some((r) => r.raci_role === "A") ? (');
    expect(client).toContain("Chuyển giao A");
    expect(client).toContain('body: JSON.stringify({ user_id: transferPerson, raci_role: "A", replace_existing: true }),');
  });
});
