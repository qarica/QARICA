import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Việc của tôi: chuyển việc cho người khác — hàm DB", () => {
  const sql = read("supabase/migrations/20261202000007_work_reassign_v1.sql");
  it("một giao dịch: kiểm tra, cập nhật, audit_logs và thông báo; chỉ service_role gọi được", () => {
    expect(sql).toContain("create or replace function public.qlcl_reassign_work_v1(");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('work_reassign:'");
    expect(sql).toContain("insert into public.audit_logs");
    expect(sql).toContain("'WORK_REASSIGN'");
    expect(sql).toContain("insert into public.notifications");
    expect(sql).toContain("'WORK_REASSIGNED'");
    for (const fn of ["qlcl_reassign_work_v1(uuid, uuid, text, uuid, uuid, text)", "qlcl_list_work_assignees_v1(uuid, uuid, text, integer)", "qlcl_user_has_permission_v1(uuid, text)"]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });
  it("quy tắc: lý do ≥ 5 ký tự, không tự chuyển cho mình, người nhận cùng bệnh viện + đang hoạt động + có tasks.view", () => {
    expect(sql).toContain("char_length(v_reason) < 5");
    expect(sql).toContain("p_actor_user_id = p_to_user_id");
    expect(sql).toContain("v_to.is_active");
    expect(sql).toContain("v_to.organization_id is distinct from p_organization_id");
    expect(sql).toContain("qlcl_user_has_permission_v1(p_to_user_id, 'tasks.view')");
  });
  it("việc cá nhân: chỉ chủ việc, chỉ việc đang mở; từ chối đề nghị gia hạn chờ (không xóa người duyệt vì trigger không cho)", () => {
    expect(sql).toContain("r.owner_user_id <> p_actor_user_id");
    expect(sql).toContain("r.status <> 'OPEN'");
    expect(sql).toContain("set status = 'REJECTED'");
    expect(sql).not.toMatch(/delete from public\.personal_task_approvers/);
  });
  it("Action: chỉ giao trực tiếp cho cá nhân (USER) và chính người chuyển; chỉ NOT_STARTED/IN_PROGRESS/RETURNED; giữ nguyên hạn/minh chứng", () => {
    expect(sql).toContain("a.assignment_target_type <> 'USER' or a.assignee_user_id is distinct from p_actor_user_id");
    expect(sql).toContain("a.workflow_status not in ('NOT_STARTED', 'IN_PROGRESS', 'RETURNED')");
    expect(sql).toContain("update public.actions set assignee_user_id = p_to_user_id, updated_at = now()");
    expect(sql).not.toMatch(/update public\.actions set[^;]*due_date/);
  });
});

describe("chuyển việc — API và giao diện", () => {
  const assignees = read("src/app/api/work/assignees/route.ts");
  const reassign = read("src/app/api/work/reassign/route.ts");
  const button = read("src/components/work-reassign-button.tsx");
  const page = read("src/app/(app)/tasks/page.tsx");
  it("hai API đều đòi tasks.view và dùng hàm DB (không tự ghi bảng)", () => {
    expect(assignees).toContain('requireApiContext("tasks.view")');
    expect(assignees).toContain("qlcl_list_work_assignees_v1");
    expect(reassign).toContain('requireApiContext("tasks.view")');
    expect(reassign).toContain("qlcl_reassign_work_v1");
    // Nhánh người nhận CHƯA có tài khoản (handoverToExternal) là ghi nhận tại chỗ; nhánh chuyển thật chỉ qua hàm DB.
    expect(reassign.split("async function handoverToExternal")[0]).not.toMatch(/\.from\("(actions|personal_reminders|notifications)"\)/);
  });
  it("API kiểm tra loại việc, UUID và lý do trước khi gọi DB", () => {
    expect(reassign).toContain('new Set(["REMINDER", "ACTION"])');
    expect(reassign).toContain("UUID_RE.test(sourceId)");
    expect(reassign).toContain("reason.length < 5");
  });
  it("hộp thoại: tìm người nhận, bắt buộc chọn người + lý do, làm mới trang sau khi chuyển", () => {
    expect(button).toContain("/api/work/assignees?q=");
    expect(button).toContain('"/api/work/reassign"');
    expect(button).toContain("reason.trim().length < 5");
    expect(button).toContain("router.refresh()");
    expect(button).toContain('className="modal-head"');
  });
  it("trang: nút Chuyển chỉ hiện cho việc đủ điều kiện, ở cả bảng và thẻ điện thoại", () => {
    expect(page).toContain('canReassign:r.assignment_target_type==="USER"&&r.assignee_user_id===user.id&&["NOT_STARTED","IN_PROGRESS","RETURNED"]');
    expect(page).toContain('canReassign:p.status==="OPEN",reassignSource:"REMINDER"');
    // Việc cá nhân: nút Chuyển nằm trong menu "⋯" của UnifiedPersonalTaskActions; việc khác (Action): nút ngoài, ở cả bảng và thẻ điện thoại.
    expect((page.match(/>\{reassignBtn\(r\)\}<\/UnifiedPersonalTaskActions>/g) || []).length).toBe(2);
    expect((page.match(/:reassignBtn\(r\)\}/g) || []).length).toBe(2);
  });
});

describe("giao diện Việc của tôi đã gộp gọn", () => {
  const page = read("src/app/(app)/tasks/page.tsx");
  const quick = read("src/components/personal-reminders.tsx");
  it("không còn banner hình minh họa/câu trích dẫn, 5 thẻ số, Việc cần làm trước, khối thông báo", () => {
    for (const gone of ["my-work-illustration", "my-work-quote", '<section className="kpis">', "Việc cần làm trước", "thông báo chưa đọc"]) expect(page, gone).not.toContain(gone);
  });
  it("lọc theo tuần nằm trong mục gập; mặc định chỉ mở khi đang lọc", () => {
    expect(page).toContain('<details className="mw-week" open={!!pStart}>');
  });
  it("thêm việc cá nhân gọn một dòng, chi tiết gập; không hỏi 'đặt nhắc nhở?' mỗi lần thêm", () => {
    expect(quick).toContain('className="pr-quick"');
    expect(quick).toContain('<details className="pr-more"');
    expect(quick).not.toContain("Bạn có muốn đặt nhắc nhở");
    expect(quick).not.toContain("Ma trận Eisenhower");
  });
  it("khối đề nghị gia hạn chỉ hiện khi có đề nghị chờ duyệt", () => {
    expect(read("src/components/task-extension-review-queue.tsx")).toContain("if(!loading&&items.length===0&&!error)return null;");
  });
});
