import type { SupabaseClient } from "@supabase/supabase-js";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";

// Nguồn sự thật duy nhất cho "Action/EMR nào đang là việc của tôi" — dùng
// chung cho /tasks (Việc của tôi đầy đủ) và /calendar/my-work (góc nhìn gắn
// Lịch). Trước đây 2 trang tính riêng: /calendar/my-work chỉ lọc action theo
// assignee_user_id trực tiếp, bỏ sót action giao qua NHÓM (work_group_
// assignment_snapshots) và phần việc khoa/phòng (action_department_
// executions cho Trưởng khoa/Thành viên mạng lưới QLCL) cũng như hạng mục EMR
// của khoa/phòng mình — khiến "Việc của tôi" hẹp hơn hẳn /tasks dù mô tả nói
// "cùng 1 dữ liệu". Không đổi phần hàng đợi theo vai trò (QLCL toàn viện/
// Trưởng khoa) hay thông báo attention — đó là góc nhìn quản lý riêng của
// /tasks, không thuộc "việc được giao cho chính tôi". /tasks/page.tsx hiện
// chưa gọi hàm này (logic riêng, đã chạy đúng trên production) — hàm này mới
// dùng cho /calendar/my-work để hết lệch; gộp /tasks dùng chung để lại cho
// một đợt refactor riêng, tránh rủi ro sửa nhầm trang đang chạy đúng.
const ACTION_SELECT = "action_id,record_id,record_code,title,work_year,workflow_status,priority,due_date,is_overdue,days_to_due,assignee_group_id";

export type MyAssignedActionRow = {
  action_id: string;
  record_id: string;
  record_code: string;
  title: string;
  workflow_status: string;
  priority: string | null;
  due_date: string | null;
  is_overdue: boolean;
  days_to_due: number | null;
  assignee_group_id: string | null;
};

export type MyEmrItemRow = {
  id: string;
  category: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
};

export async function loadMyAssignedWork(
  supabase: SupabaseClient,
  user: { id: string; organizationId: string | null; primaryDepartmentId: string | null },
  year: number,
  options: { includeEmr: boolean },
): Promise<{ actionRows: MyAssignedActionRow[]; emrRows: MyEmrItemRow[]; error: string | null }> {
  const groupAssignmentRes = await supabase
    .from("work_group_assignment_snapshots")
    .select("target_record_id,group_id,member_snapshot")
    .eq("assignment_role", "ACTION_ASSIGNEE_GROUP");
  const myGroupActionRecordIds = Array.from(
    new Set(
      (groupAssignmentRes.data ?? [])
        .filter((row: any) => Array.isArray(row.member_snapshot) && row.member_snapshot.some((member: any) => member?.user_id === user.id))
        .map((row: any) => row.target_record_id)
        .filter(Boolean),
    ),
  ) as string[];

  const departmentRoleRes = user.primaryDepartmentId
    ? await supabase.from("department_user_roles").select("role_type").eq("department_id", user.primaryDepartmentId).eq("user_id", user.id).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"])
    : { data: [], error: null };
  const canOperateDepartment = !!user.primaryDepartmentId && (departmentRoleRes.data ?? []).length > 0;
  const departmentExecutionRes = canOperateDepartment
    ? await supabase.from("action_department_executions").select("action_id").eq("department_id", user.primaryDepartmentId)
    : { data: [], error: null };
  const departmentActionIds = Array.from(new Set((departmentExecutionRes.data ?? []).map((x: any) => x.action_id).filter(Boolean))) as string[];

  const recurringLegacyRes = await supabase
    .from("recurring_work_runs")
    .select("generated_action_id,recurring_work_templates!inner(automation_kind)")
    .not("generated_action_id", "is", null)
    .eq("recurring_work_templates.automation_kind", "REMINDER");
  const legacyReminderActionIds = new Set((recurringLegacyRes.data ?? []).map((x: any) => x.generated_action_id).filter(Boolean));

  const [directActionsRes, groupActionsRes, departmentActionsRes] = await Promise.all([
    supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year", year).eq("assignee_user_id", user.id),
    myGroupActionRecordIds.length ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year", year).in("record_id", myGroupActionRecordIds) : Promise.resolve({ data: [] as any[], error: null }),
    departmentActionIds.length ? supabase.from("vw_actions_dashboard").select(ACTION_SELECT).eq("work_year", year).in("action_id", departmentActionIds) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const actionRowsById = new Map<string, any>();
  for (const row of [...(directActionsRes.data ?? []), ...(groupActionsRes.data ?? []), ...(departmentActionsRes.data ?? [])]) actionRowsById.set(row.action_id, row);

  const recordIds = Array.from(new Set(Array.from(actionRowsById.values()).map((r: any) => r.record_id).filter(Boolean)));
  const recordRes = recordIds.length ? await supabase.from("records").select("id,lifecycle_status").in("id", recordIds) : { data: [] as any[], error: null };
  const hidden = new Set((recordRes.data ?? []).filter((r: any) => isOperationallyHiddenStatus(r.lifecycle_status)).map((r: any) => r.id));

  const actionRows = Array.from(actionRowsById.values()).filter(
    (r: any) => r.workflow_status !== "CANCELLED" && !hidden.has(r.record_id) && !legacyReminderActionIds.has(r.action_id),
  ) as MyAssignedActionRow[];

  let emrRows: MyEmrItemRow[] = [];
  if (options.includeEmr && user.organizationId) {
    const emrItemsRes = await supabase
      .from("emr_rollout_items")
      .select("id,category,title,status,due_date,priority,owner_department_id,department_ids,publish_status")
      .eq("organization_id", user.organizationId)
      .neq("status", "DONE")
      .not("due_date", "is", null);
    // Báo cáo thực tế "Tổng quan EMR chưa đồng bộ": Biểu mẫu còn Nháp (chưa
    // duyệt phát hành) chưa được coi là đang triển khai chính thức — loại
    // khỏi "Việc của tôi" (cả góc nhìn /calendar/my-work dùng hàm này), nhất
    // quán với Tổng quan EMR, /tasks, lịch và nhắc hạn.
    emrRows = user.primaryDepartmentId
      ? ((emrItemsRes.data ?? []) as any[]).filter((item) => !(item.category === "BIEU_MAU" && item.publish_status === "DRAFT") && (item.owner_department_id === user.primaryDepartmentId || item.department_ids?.includes(user.primaryDepartmentId)))
      : [];
  }

  const firstError =
    groupAssignmentRes.error || departmentRoleRes.error || departmentExecutionRes.error || recurringLegacyRes.error || directActionsRes.error || groupActionsRes.error || departmentActionsRes.error || recordRes.error;
  return { actionRows, emrRows, error: firstError ? firstError.message : null };
}

export function emrCategorySlug(code: string): string | undefined {
  return EMR_CATEGORIES.find((c) => c.code === code)?.slug;
}
export function emrCategoryLabel(code: string): string {
  return EMR_CATEGORIES.find((c) => c.code === code)?.label || code;
}
