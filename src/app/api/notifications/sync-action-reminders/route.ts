import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkYear } from "@/lib/work-year";

function reminderPhase(days: number | null) {
  if (days === null) return null;
  if (days <= -7) return { code: "OVERDUE_7", priority: "CRITICAL", title: "Công việc quá hạn nghiêm trọng" };
  if (days <= -3) return { code: "OVERDUE_3", priority: "URGENT", title: "Công việc cần đôn đốc" };
  if (days < 0) return { code: "OVERDUE", priority: "URGENT", title: "Công việc đã quá hạn" };
  if (days === 0) return { code: "DUE_TODAY", priority: "HIGH", title: "Công việc đến hạn hôm nay" };
  if (days <= 3) return { code: "DUE_SOON", priority: "HIGH", title: "Công việc sắp đến hạn" };
  return null;
}

function reminderMessage(days: number, recordCode: string | null, title: string) {
  const prefix = recordCode ? `${recordCode} · ` : "";
  if (days <= -7) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần xử lý hoặc báo cáo vướng mắc ngay.`;
  if (days <= -3) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. QARICA đề nghị đôn đốc và cập nhật tiến độ.`;
  if (days < 0) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Ưu tiên xử lý trước công việc mới.`;
  if (days === 0) return `${prefix}${title} đến hạn hôm nay. Cần hoàn tất hoặc cập nhật tiến độ trước cuối ngày.`;
  return `${prefix}${title} còn ${days} ngày đến hạn. Chủ động chuẩn bị để tránh quá hạn.`;
}

type ActionRow = {
  action_id: string;
  record_id: string | null;
  record_code: string | null;
  title: string;
  workflow_status: string;
  days_to_due: number | null;
  due_date: string | null;
  assignment_target_type: string | null;
  assignee_user_id: string | null;
  assignee_group_id: string | null;
};

type NotificationPayload = {
  recipient_user_id: string;
  notification_type: string;
  priority: string;
  title: string;
  message: string;
  target_record_id: string | null;
  target_route: string;
  notification_event_key: string;
  is_read: boolean;
};

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const year = await getWorkYear();
  const userId = auth.user.id;
  const [{ data, error }, { data: profile, error: profileError }, { data: groupSnapshots, error: groupError }] = await Promise.all([
    supabase.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,workflow_status,days_to_due,due_date,assignment_target_type,assignee_user_id,assignee_group_id").eq("work_year", year),
    supabase.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle(),
    supabase.from("work_group_assignment_snapshots").select("target_record_id,member_snapshot").eq("assignment_role", "ACTION_ASSIGNEE_GROUP"),
  ]);

  if (error || profileError || groupError) return NextResponse.json({ error: error?.message || profileError?.message || groupError?.message }, { status: 400 });

  const myGroupRecordIds = new Set((groupSnapshots ?? []).filter((row: any) => Array.isArray(row.member_snapshot) && row.member_snapshot.some((member: any) => String(member?.user_id || "").trim() === userId)).map((row: any) => row.target_record_id).filter(Boolean));
  const primaryDepartmentId = profile?.primary_department_id || null;
  let departmentActionIds = new Set<string>();
  if (primaryDepartmentId) {
    const [{ data: roles, error: rolesError }, { data: executions, error: executionsError }] = await Promise.all([
      supabase.from("department_user_roles").select("role_type").eq("department_id", primaryDepartmentId).eq("user_id", userId).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"]),
      supabase.from("action_department_executions").select("action_id").eq("department_id", primaryDepartmentId),
    ]);
    if (rolesError || executionsError) return NextResponse.json({ error: rolesError?.message || executionsError?.message }, { status: 400 });
    if ((roles ?? []).length) departmentActionIds = new Set((executions ?? []).map((row: any) => row.action_id).filter(Boolean));
  }

  const assignedRows = ((data ?? []) as ActionRow[]).filter((row) => row.assignee_user_id === userId || (row.assignment_target_type === "GROUP" && !!row.record_id && myGroupRecordIds.has(row.record_id)) || (row.assignment_target_type === "DEPARTMENT" && departmentActionIds.has(row.action_id)));

  const payload: NotificationPayload[] = [];
  for (const row of assignedRows) {
    if (["COMPLETED", "CANCELLED", "NOT_APPLICABLE", "CLOSED"].includes(String(row.workflow_status))) continue;
    const days = row.days_to_due === null || row.days_to_due === undefined ? null : Number(row.days_to_due);
    const phase = reminderPhase(days);
    if (!phase || days === null) continue;
    const dueKey = row.due_date ? String(row.due_date).slice(0, 10) : "none";
    payload.push({
      recipient_user_id: userId,
      notification_type: `ACTION_${phase.code}`,
      priority: phase.priority,
      title: phase.title,
      message: reminderMessage(days, row.record_code, row.title),
      target_record_id: row.record_id,
      target_route: row.record_id ? `/tasks/${row.record_id}` : "/tasks",
      // One reminder per Action + due date + urgency phase. A new phase must not retain stale copy/priority.
      notification_event_key: `action:${userId}:${row.action_id}:due:${dueKey}:phase:${phase.code}`,
      is_read: false,
    });
  }

  if (!payload.length) return NextResponse.json({ ok: true, created: 0, candidates: 0 });

  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ ok: true, created: inserted?.length || 0, candidates: payload.length });
}
