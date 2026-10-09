import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// Phát hiện Trung bình: "Việc của tôi" trong Lịch QLCL (/calendar/my-work) mô
// tả là "cùng dữ liệu" với /tasks nhưng trước đây chỉ lọc Action theo
// assignee_user_id trực tiếp — bỏ sót Action giao qua NHÓM, phần việc
// khoa/phòng (Trưởng khoa/Thành viên mạng lưới QLCL), và hạng mục EMR của
// khoa/phòng mình mà /tasks đã có. Trích 1 hàm dùng chung (src/lib/my-
// assigned-work.ts) thay vì để 2 trang tự tính lại, dễ lệch tiếp về sau.
describe("Lịch QLCL 'Việc của tôi' dùng chung nguồn với /tasks, không còn hẹp hơn", () => {
  it("src/lib/my-assigned-work.ts gộp đủ 3 nguồn Action (trực tiếp + nhóm + khoa/phòng) và EMR", () => {
    const lib = read("src/lib/my-assigned-work.ts");
    expect(lib).toContain('eq("assignment_role", "ACTION_ASSIGNEE_GROUP")');
    expect(lib).toContain('.in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"])');
    expect(lib).toContain('from("action_department_executions")');
    expect(lib).toContain('from("emr_rollout_items")');
  });

  it("calendar/my-work/page.tsx giờ gọi loadMyAssignedWork thay vì tự lọc assignee_user_id một mình", () => {
    const page = read("src/app/(app)/calendar/my-work/page.tsx");
    expect(page).toContain('import { emrCategoryLabel, emrCategorySlug, loadMyAssignedWork } from "@/lib/my-assigned-work";');
    expect(page).toContain("loadMyAssignedWork(supabase,");
    expect(page).toContain("includeEmr: true");
    expect(page).not.toContain('.eq("assignee_user_id", user.id).order("due_date"');
  });

  it("hạng mục EMR của khoa/phòng giờ cũng xuất hiện trong tab 'Công việc được giao' của Lịch QLCL", () => {
    const page = read("src/app/(app)/calendar/my-work/page.tsx");
    expect(page).toContain("const assignedEmrRows: Row[] = emrRows.map");
    expect(page).toContain("const assignedRows: Row[] = [...assignedActionRows, ...assignedEmrRows];");
  });

  // Báo cáo thực tế "Tổng quan EMR chưa đồng bộ": Biểu mẫu còn Nháp (chưa
  // duyệt phát hành) chưa được coi là đang triển khai chính thức — loại khỏi
  // "Việc của tôi" ở góc nhìn Lịch QLCL cũng qua đúng 1 hàm dùng chung này,
  // nhất quán với Tổng quan EMR, /tasks, lịch và nhắc hạn.
  it("loại Biểu mẫu còn Nháp khỏi Việc của tôi — chưa duyệt phát hành thì chưa coi là đang triển khai", () => {
    const lib = read("src/lib/my-assigned-work.ts");
    expect(lib).toContain('.select("id,category,title,status,due_date,priority,owner_department_id,department_ids,publish_status")');
    expect(lib).toContain('!(item.category === "BIEU_MAU" && item.publish_status === "DRAFT")');
  });
});
