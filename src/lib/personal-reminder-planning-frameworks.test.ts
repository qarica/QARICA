import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Yêu cầu tường minh: "Áp dụng được vào qarica ok ko" -> "Xây thành tính năng
// trong QARICA" -> áp dụng khung 5W1H/SMART/Eisenhower vào Việc cá nhân
// (personal_reminders). RACI không áp dụng ở đây vì note cá nhân chỉ có 1
// chủ — xem module work_plans riêng cho việc nhóm.
describe("Việc cá nhân: Eisenhower + SMART/5W1H (Part 1 — không có RACI vì chỉ 1 chủ)", () => {
  it("migration chỉ CỘNG THÊM 4 cột optional (why/where/how/smart_target), không đổi cột/constraint nào khác của personal_reminders", () => {
    const migration = read("supabase/migrations/20261126000000_personal_reminder_planning_fields_v1.sql");
    expect(migration).toContain("alter table public.personal_reminders add column if not exists why_text text;");
    expect(migration).toContain("alter table public.personal_reminders add column if not exists where_text text;");
    expect(migration).toContain("alter table public.personal_reminders add column if not exists how_text text;");
    expect(migration).toContain("alter table public.personal_reminders add column if not exists smart_target text;");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("alter table public.personal_reminders drop constraint");
  });

  it("Eisenhower quadrant KHÔNG có cột DB riêng — tính (computed) từ priority+due_at, giống cách incoming_documents tính Trạng thái thay vì lưu tay", () => {
    const migration = read("supabase/migrations/20261126000000_personal_reminder_planning_fields_v1.sql");
    expect(migration).not.toContain("eisenhower");
    const lib = read("src/lib/eisenhower.ts");
    expect(lib).toContain("export function personalReminderQuadrant(priority: string, dueDateOnly: string | null, todayDateOnly: string): EisenhowerQuadrant {");
  });

  it("form Tạo việc cá nhân có mục 'Lập kế hoạch đầy đủ' thu gọn mặc định (planOpen=false), đúng 3 trường 5W1H còn thiếu (Why/Where/How) + 1 trường SMART (Measurable)", () => {
    const client = read("src/components/personal-reminders.tsx");
    expect(client).toContain("const [planOpen,setPlanOpen]=useState(false);");
    expect(client).toContain("Tại sao (Why) — lý do/mục đích");
    expect(client).toContain("Ở đâu (Where) — không bắt buộc");
    expect(client).toContain("Như thế nào (How) — cách thực hiện");
    expect(client).toContain("Mục tiêu đo lường được (SMART — Measurable)");
  });

  it("add() gửi đủ 4 trường mới lên personal_reminders, cắt khoảng trắng thừa và rỗng thành null (không lưu chuỗi rỗng)", () => {
    const client = read("src/components/personal-reminders.tsx");
    expect(client).toContain("why_text:whyText.trim()||null,where_text:whereText.trim()||null,how_text:howText.trim()||null,smart_target:smartTarget.trim()||null");
  });

  it("có Ma trận Eisenhower hiện 4 ô P1-P4 tính từ personalReminderQuadrant() trên các việc đang mở (status OPEN)", () => {
    const client = read("src/components/personal-reminders.tsx");
    expect(client).toContain('const openQuadrants=rows.filter(r=>r.status==="OPEN").map(r=>({...r,quadrant:personalReminderQuadrant(r.priority,r.due_at?hcmDateKey(r.due_at):null,today)}));');
    expect(client).toContain("Ma trận Eisenhower");
    expect(client).toContain("{EISENHOWER_QUADRANTS.map(q=>");
  });
});
