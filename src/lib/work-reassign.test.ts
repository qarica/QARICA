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
  it("việc cá nhân: chỉ chủ việc, chỉ việc đang mở", () => {
    expect(sql).toContain("r.owner_user_id <> p_actor_user_id");
    expect(sql).toContain("r.status <> 'OPEN'");
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
    expect(reassign).toContain('new Set(["REMINDER", "ACTION", "WORK_PLAN"])');
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
    expect((page.match(/>\{reassignBtn\(r\)\}\{waitCtl\(r\)\}<\/UnifiedPersonalTaskActions>/g) || []).length).toBe(2);
    expect((page.match(/:<>\{incomingBtn\(r\)\}\{reassignBtn\(r\)\}<\/>\}/g) || []).length).toBe(2);
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
});

describe("chuyển việc — mở rộng cho đầu việc Kế hoạch công việc (WORK_PLAN)", () => {
  const sql = readFileSync("supabase/migrations/20261202000009_work_reassign_work_plan_v1.sql", "utf8");
  it("hàm DB có nhánh WORK_PLAN: chỉ người đang phụ trách + đang mở, người nhận phải có work_plans.view", () => {
    expect(sql).toContain("p_source not in ('REMINDER', 'ACTION', 'WORK_PLAN')");
    expect(sql).toContain("w.assignee_user_id is distinct from p_actor_user_id");
    expect(sql).toContain("w.status <> 'OPEN'");
    expect(sql).toContain("'work_plans.view'");
    expect(sql).toContain("update public.work_plan_items set assignee_user_id = p_to_user_id");
    expect(sql).toContain("revoke all on function public.qlcl_reassign_work_v1(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;");
  });
  it("API và giao diện nhận nguồn WORK_PLAN; không cho gõ tên tự do với đầu việc kế hoạch", () => {
    expect(readFileSync("src/app/api/work/reassign/route.ts", "utf8")).toContain('new Set(["REMINDER", "ACTION", "WORK_PLAN"])');
    expect(readFileSync("src/app/api/work/reassign/route.ts", "utf8")).toContain('source === "WORK_PLAN") return NextResponse.json({ error: "Đầu việc kế hoạch chỉ chuyển được');
    expect(readFileSync("src/components/work-reassign-button.tsx", "utf8")).toContain('source !== "WORK_PLAN" && list !== null && q.trim().length >= 2');
    expect(readFileSync("src/app/api/work/assignees/route.ts", "utf8")).toContain('"work_plans.view"');
  });
  it("hàng đầu việc kế hoạch trong Việc của tôi có nút Chuyển khi đang mở; mục Đã chuyển đi hiển thị được", () => {
    expect(readFileSync("src/app/(app)/tasks/page.tsx", "utf8")).toContain('canReassign:item.status==="OPEN",reassignSource:"WORK_PLAN"');
    expect(readFileSync("src/lib/my-work-handed.ts", "utf8")).toContain('table_name === "work_plan_items"');
  });
});
