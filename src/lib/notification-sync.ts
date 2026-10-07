import type { SupabaseClient } from "@supabase/supabase-js";
import { EMR_CATEGORIES } from "@/lib/emr-categories";
import { routeForRecord } from "@/lib/record-route";

type AdminClient = SupabaseClient;

export async function userHasPermission(admin: AdminClient, userId: string, code: string) {
  const { data: permission } = await admin.from("permissions").select("id").eq("code", code).maybeSingle();
  if (!permission?.id) return false;

  const { data: override } = await admin.from("user_permissions").select("is_allowed").eq("user_id", userId).eq("permission_id", permission.id).maybeSingle();
  if (override) return !!override.is_allowed;

  const { data: roles } = await admin.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (roles ?? []).map((x: any) => x.role_id).filter(Boolean);
  if (!roleIds.length) return false;

  const { count } = await admin.from("role_permissions").select("role_id", { count: "exact", head: true }).in("role_id", roleIds).eq("permission_id", permission.id);
  return (count ?? 0) > 0;
}

// --- Action reminders (việc của tôi) ---------------------------------------

function actionReminderPhase(days: number | null) {
  if (days === null) return null;
  if (days <= -7) return { code: "OVERDUE_7", priority: "CRITICAL", title: "Công việc quá hạn nghiêm trọng" };
  if (days <= -3) return { code: "OVERDUE_3", priority: "URGENT", title: "Công việc cần đôn đốc" };
  if (days < 0) return { code: "OVERDUE", priority: "URGENT", title: "Công việc đã quá hạn" };
  if (days === 0) return { code: "DUE_TODAY", priority: "HIGH", title: "Công việc đến hạn hôm nay" };
  if (days <= 3) return { code: "DUE_SOON", priority: "HIGH", title: "Công việc sắp đến hạn" };
  return null;
}

function actionReminderMessage(days: number, recordCode: string | null, title: string) {
  const prefix = recordCode ? `${recordCode} · ` : "";
  if (days <= -7) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần xử lý hoặc báo cáo vướng mắc ngay.`;
  if (days <= -3) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. QARICA đề nghị đôn đốc và cập nhật tiến độ.`;
  if (days < 0) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Ưu tiên xử lý trước công việc mới.`;
  if (days === 0) return `${prefix}${title} đến hạn hôm nay. Cần hoàn tất hoặc cập nhật tiến độ trước cuối ngày.`;
  return `${prefix}${title} còn ${days} ngày đến hạn. Chủ động chuẩn bị để tránh quá hạn.`;
}

export async function syncActionRemindersForUser(admin: AdminClient, userId: string, year: number) {
  const [{ data, error }, { data: profile, error: profileError }, { data: groupSnapshots, error: groupError }] = await Promise.all([
    admin.from("vw_actions_dashboard").select("action_id,record_id,record_code,title,workflow_status,days_to_due,due_date,assignment_target_type,assignee_user_id,assignee_group_id").eq("work_year", year),
    admin.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle(),
    admin.from("work_group_assignment_snapshots").select("target_record_id,member_snapshot").eq("assignment_role", "ACTION_ASSIGNEE_GROUP"),
  ]);
  if (error || profileError || groupError) return { error: error?.message || profileError?.message || groupError?.message || "Lỗi không xác định." };

  const myGroupRecordIds = new Set((groupSnapshots ?? []).filter((row: any) => Array.isArray(row.member_snapshot) && row.member_snapshot.some((member: any) => String(member?.user_id || "").trim() === userId)).map((row: any) => row.target_record_id).filter(Boolean));
  const primaryDepartmentId = profile?.primary_department_id || null;
  let departmentActionIds = new Set<string>();
  if (primaryDepartmentId) {
    const [{ data: roles, error: rolesError }, { data: executions, error: executionsError }] = await Promise.all([
      admin.from("department_user_roles").select("role_type").eq("department_id", primaryDepartmentId).eq("user_id", userId).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"]),
      admin.from("action_department_executions").select("action_id").eq("department_id", primaryDepartmentId),
    ]);
    if (rolesError || executionsError) return { error: rolesError?.message || executionsError?.message || "Lỗi không xác định." };
    if ((roles ?? []).length) departmentActionIds = new Set((executions ?? []).map((row: any) => row.action_id).filter(Boolean));
  }

  const assignedRows = ((data ?? []) as any[]).filter((row) => row.assignee_user_id === userId || (row.assignment_target_type === "GROUP" && !!row.record_id && myGroupRecordIds.has(row.record_id)) || (row.assignment_target_type === "DEPARTMENT" && departmentActionIds.has(row.action_id)));

  const payload: any[] = [];
  for (const row of assignedRows) {
    if (["COMPLETED", "CANCELLED", "NOT_APPLICABLE", "CLOSED"].includes(String(row.workflow_status))) continue;
    const days = row.days_to_due === null || row.days_to_due === undefined ? null : Number(row.days_to_due);
    const phase = actionReminderPhase(days);
    if (!phase || days === null) continue;
    const dueKey = row.due_date ? String(row.due_date).slice(0, 10) : "none";
    payload.push({
      recipient_user_id: userId,
      notification_type: `ACTION_${phase.code}`,
      priority: phase.priority,
      title: phase.title,
      message: actionReminderMessage(days, row.record_code, row.title),
      target_record_id: row.record_id,
      target_route: row.record_id ? `/tasks/${row.record_id}` : "/tasks",
      notification_event_key: `action:${userId}:${row.action_id}:due:${dueKey}:phase:${phase.code}`,
      is_read: false,
    });
  }

  if (!payload.length) return { created: 0, candidates: 0 };
  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };
  return { created: inserted?.length || 0, candidates: payload.length };
}

// --- EMR rollout reminders ---------------------------------------------------

function emrReminderPhase(days: number | null) {
  if (days === null) return null;
  if (days <= -7) return { code: "OVERDUE_7", priority: "CRITICAL", title: "Hạng mục EMR quá hạn nghiêm trọng" };
  if (days <= -3) return { code: "OVERDUE_3", priority: "URGENT", title: "Hạng mục EMR cần đôn đốc" };
  if (days < 0) return { code: "OVERDUE", priority: "URGENT", title: "Hạng mục EMR đã quá hạn" };
  if (days === 0) return { code: "DUE_TODAY", priority: "HIGH", title: "Hạng mục EMR đến hạn hôm nay" };
  if (days <= 3) return { code: "DUE_SOON", priority: "HIGH", title: "Hạng mục EMR sắp đến hạn" };
  return null;
}

function emrReminderMessage(days: number, categoryLabel: string, title: string) {
  const prefix = `${categoryLabel} · `;
  if (days <= -7) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần xử lý hoặc báo cáo vướng mắc ngay.`;
  if (days <= -3) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần đôn đốc và cập nhật tiến độ.`;
  if (days < 0) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Ưu tiên xử lý trước công việc mới.`;
  if (days === 0) return `${prefix}${title} đến hạn hôm nay. Cần hoàn tất hoặc cập nhật tiến độ trước cuối ngày.`;
  return `${prefix}${title} còn ${days} ngày đến hạn. Chủ động chuẩn bị để tránh quá hạn.`;
}

function emrCertPhase(days: number | null) {
  if (days === null) return null;
  if (days < 0) return { code: "CERT_EXPIRED", priority: "CRITICAL", title: "Chữ ký số đã hết hạn" };
  if (days <= 30) return { code: "CERT_EXPIRING", priority: "HIGH", title: "Chữ ký số sắp hết hạn" };
  return null;
}

function emrCertMessage(days: number, title: string) {
  if (days < 0) return `${title}: chứng thư chữ ký số đã hết hạn ${Math.abs(days)} ngày. Cần gia hạn/cấp lại ngay.`;
  return `${title}: chứng thư chữ ký số còn ${days} ngày là hết hạn. Chủ động gia hạn trước khi hết hạn.`;
}

function daysBetween(todayKey: string, dateKey: string) {
  return Math.round((Date.parse(dateKey) - Date.parse(todayKey)) / 86400000);
}

export async function syncEmrRemindersForUser(admin: AdminClient, userId: string) {
  const { data: profile, error: profileError } = await admin.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle();
  if (profileError) return { error: profileError.message };
  const primaryDepartmentId = profile?.primary_department_id || null;
  let items: { id: string; category: string; title: string; status: string; due_date: string | null; details: Record<string, unknown> | null }[] = [];
  if (primaryDepartmentId) {
    const { data: roles, error: rolesError } = await admin.from("department_user_roles").select("role_type").eq("department_id", primaryDepartmentId).eq("user_id", userId).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"]);
    if (rolesError) return { error: rolesError.message };
    if ((roles ?? []).length) {
      const { data, error } = await admin.from("emr_rollout_items").select("id,category,title,status,due_date,owner_department_id,details").eq("owner_department_id", primaryDepartmentId);
      if (error) return { error: error.message };
      items = data ?? [];
    }
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const payload: any[] = [];

  for (const item of items) {
    const category = EMR_CATEGORIES.find((c) => c.code === item.category);
    const categoryLabel = category?.label || String(item.category);
    const route = category ? `/emr/${category.slug}` : "/emr";

    if (item.status !== "DONE" && item.due_date) {
      const dueKey = String(item.due_date).slice(0, 10);
      const phase = emrReminderPhase(daysBetween(todayKey, dueKey));
      if (phase) {
        payload.push({
          recipient_user_id: userId,
          notification_type: `EMR_ITEM_${phase.code}`,
          priority: phase.priority,
          title: phase.title,
          message: emrReminderMessage(daysBetween(todayKey, dueKey), categoryLabel, item.title),
          target_record_id: null,
          target_route: route,
          notification_event_key: `emr_item:${userId}:${item.id}:due:${dueKey}:phase:${phase.code}`,
          is_read: false,
        });
      }
    }

    const certExpiry = item.category === "CHU_KY_SO" ? (item.details as Record<string, unknown> | null)?.certificate_expiry : null;
    if (certExpiry) {
      const expiryKey = String(certExpiry).slice(0, 10);
      const days = daysBetween(todayKey, expiryKey);
      const phase = emrCertPhase(days);
      if (phase) {
        payload.push({
          recipient_user_id: userId,
          notification_type: `EMR_${phase.code}`,
          priority: phase.priority,
          title: phase.title,
          message: emrCertMessage(days, item.title),
          target_record_id: null,
          target_route: "/emr/chu-ky-so",
          notification_event_key: `emr_item:${userId}:${item.id}:cert_expiry:${expiryKey}:phase:${phase.code}`,
          is_read: false,
        });
      }
    }
  }

  if (!payload.length) return { created: 0, candidates: 0 };
  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };
  return { created: inserted?.length || 0, candidates: payload.length };
}

// --- Monitoring (5S) recheck + awaiting-confirmation reminders ---------------

const PRE_DUE_WINDOW_MS = 60 * 1000;

function localTime(value: number) {
  return new Date(value).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
}

async function syncAwaitingConfirmation(admin: AdminClient, userId: string, profile: any) {
  if (!profile?.primary_department_id) return 0;
  if (!(await userHasPermission(admin, userId, "checklists.manage"))) return 0;

  const { data: records, error: recordsError } = await admin.from("records").select("id,record_code").eq("organization_id", profile.organization_id).eq("owner_department_id", profile.primary_department_id).eq("record_type", "MONITORING").eq("lifecycle_status", "ACTIVE");
  if (recordsError || !records?.length) return 0;

  const recordIds = records.map((x: any) => x.id);
  const { data: rounds, error: roundsError } = await admin.from("monitoring_rounds").select("id,record_id,workflow_status").in("record_id", recordIds).eq("workflow_status", "AWAITING_CONFIRMATION");
  if (roundsError || !rounds?.length) return 0;

  const recordMap = new Map(records.map((x: any) => [x.id, x]));
  const payload = rounds.map((round: any) => {
    const record = recordMap.get(round.record_id) as any;
    return {
      recipient_user_id: userId,
      notification_type: "MONITORING_AWAITING_CONFIRMATION",
      priority: "HIGH",
      title: "Bảng kiểm chờ Phòng QLCL xác nhận",
      message: `${record?.record_code || "Đợt giám sát"}: đã hoàn tất chấm/kiểm tra lại và đang chờ Phòng QLCL xác nhận.`,
      target_record_id: round.record_id,
      target_route: `/monitoring/${round.id}`,
      notification_event_key: `monitoring_awaiting_confirmation:${round.id}`,
      is_read: false,
    };
  });

  const { data: inserted } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  return inserted?.length || 0;
}

export async function syncMonitoringOverdueForUser(admin: AdminClient, userId: string) {
  const { data: profile } = await admin.from("profiles").select("organization_id,is_active,primary_department_id").eq("user_id", userId).maybeSingle();
  if (!profile?.organization_id || !profile.is_active) return { created: 0, pending: 0 };

  const qlclCreated = await syncAwaitingConfirmation(admin, userId, profile);

  const [{ data: leadRounds, error: leadError }, { data: assignments, error: assignmentError }] = await Promise.all([
    admin.from("monitoring_rounds").select("id,record_id,lead_assessor_id,workflow_status").eq("lead_assessor_id", userId).eq("workflow_status", "IN_PROGRESS"),
    admin.from("monitoring_assignments").select("monitoring_round_id").eq("user_id", userId),
  ]);
  if (leadError || assignmentError) return { error: leadError?.message || assignmentError?.message || "Không kiểm tra được hạn giám sát." };

  const assignedIds = Array.from(new Set((assignments ?? []).map((x) => x.monitoring_round_id).filter(Boolean)));
  const { data: assignedRounds, error: assignedRoundsError } = assignedIds.length ? await admin.from("monitoring_rounds").select("id,record_id,lead_assessor_id,workflow_status").in("id", assignedIds).eq("workflow_status", "IN_PROGRESS") : { data: [], error: null };
  if (assignedRoundsError) return { error: assignedRoundsError.message };

  const roundMap = new Map<string, any>();
  for (const row of [...(leadRounds ?? []), ...(assignedRounds ?? [])]) roundMap.set(row.id, row);
  const rounds = Array.from(roundMap.values());
  if (!rounds.length) return { created: qlclCreated, qlcl_created: qlclCreated, pending: 0 };

  const roundIds = rounds.map((r) => r.id);
  const { data: failResponses, error: responsesError } = await admin.from("checklist_responses").select("id,monitoring_round_id,answer_value,result_status").in("monitoring_round_id", roundIds).eq("result_status", "FAIL");
  if (responsesError) return { error: responsesError.message };
  if (!failResponses?.length) return { created: qlclCreated, qlcl_created: qlclCreated, pending: 0 };

  const now = Date.now();
  const pendingByRound = new Map<string, { count: number; dueMs: number; dueIso: string }>();

  for (const response of failResponses as any[]) {
    const answerValue = response.answer_value && typeof response.answer_value === "object" ? response.answer_value : {};
    const followup = answerValue.followup && typeof answerValue.followup === "object" ? answerValue.followup : null;
    if (!followup || followup.status !== "PENDING_RECHECK" || !followup.recheck_due_at) continue;

    const dueMs = new Date(followup.recheck_due_at).getTime();
    if (!Number.isFinite(dueMs)) continue;

    const current = pendingByRound.get(response.monitoring_round_id);
    pendingByRound.set(response.monitoring_round_id, {
      count: (current?.count || 0) + 1,
      dueMs: current ? Math.min(current.dueMs, dueMs) : dueMs,
      dueIso: current && current.dueMs <= dueMs ? current.dueIso : new Date(dueMs).toISOString(),
    });
  }

  if (!pendingByRound.size) return { created: qlclCreated, qlcl_created: qlclCreated, pending: 0 };

  const recordIds = rounds.filter((r) => pendingByRound.has(r.id)).map((r) => r.record_id);
  const { data: records, error: recordsError } = await admin.from("records").select("id,record_code,organization_id").in("id", recordIds).eq("organization_id", profile.organization_id);
  if (recordsError) return { error: recordsError.message };

  const recordMap = new Map((records ?? []).map((r) => [r.id, r]));
  const payload: any[] = [];

  for (const round of rounds) {
    const pending = pendingByRound.get(round.id);
    const record = recordMap.get(round.record_id);
    if (!pending || !record) continue;

    const remainingMs = pending.dueMs - now;
    const dueTime = localTime(pending.dueMs);
    const dueKey = pending.dueIso.replace(/[^0-9]/g, "");

    if (remainingMs <= 0) {
      payload.push({
        recipient_user_id: userId,
        notification_type: "MONITORING_RECHECK_OVERDUE",
        priority: "URGENT",
        title: "Quá hạn kiểm tra lại 5S",
        message: `${record.record_code}: hạn kiểm tra lại lúc ${dueTime} đã quá hạn. Còn ${pending.count} tiêu chí Không đạt cần ghi nhận kiểm tra lại.`,
        target_record_id: round.record_id,
        target_route: `/monitoring/${round.id}`,
        notification_event_key: `monitoring_recheck_overdue_v2:${round.id}:${dueKey}`,
        is_read: false,
      });
    } else if (remainingMs <= PRE_DUE_WINDOW_MS) {
      payload.push({
        recipient_user_id: userId,
        notification_type: "MONITORING_RECHECK_DUE_SOON",
        priority: "HIGH",
        title: "Sắp đến hạn kiểm tra lại 5S",
        message: `${record.record_code}: còn dưới 01 phút đến hạn ${dueTime}. Có ${pending.count} tiêu chí Không đạt cần kiểm tra lại.`,
        target_record_id: round.record_id,
        target_route: `/monitoring/${round.id}`,
        notification_event_key: `monitoring_recheck_due_soon:${round.id}:${dueKey}`,
        is_read: false,
      });
    }
  }

  if (!payload.length) return { created: qlclCreated, qlcl_created: qlclCreated, pending: pendingByRound.size };

  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };

  return {
    created: (inserted?.length || 0) + qlclCreated,
    qlcl_created: qlclCreated,
    pending: pendingByRound.size,
    overdue: payload.filter((x) => x.notification_type === "MONITORING_RECHECK_OVERDUE").length,
    due_soon: payload.filter((x) => x.notification_type === "MONITORING_RECHECK_DUE_SOON").length,
  };
}

// --- Quality attention (chỉ đạo/báo cáo/rủi ro/CAPA/phản ánh/thanh tra/finding) ---

const ATTENTION_WINDOW_DAYS = { directive: 7, report: 7, risk: 7, capa: 7, feedback: 3, inspection: 14, finding: 7 } as const;

function hcmToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function daysTo(value: string | null | undefined, today: string) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const a = Date.parse(`${today}T00:00:00+07:00`);
  const b = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function attentionPhaseFor(value: string | null | undefined, today: string, soonDays = 1) {
  const days = daysTo(value, today);
  if (days === null) return null;
  if (days < 0) return { phase: "OVERDUE", days, priority: "URGENT" };
  if (days === 0) return { phase: "DUE_TODAY", days, priority: "HIGH" };
  if (days <= soonDays) return { phase: "DUE_SOON", days, priority: "HIGH" };
  return null;
}

function attentionDueMessage(phase: string, date: string | null | undefined, subject: string) {
  const clean = date ? String(date).slice(0, 10).split("-").reverse().join("/") : "—";
  if (phase === "OVERDUE") return `${subject} đã quá hạn ${clean}.`;
  if (phase === "DUE_TODAY") return `${subject} đến hạn hôm nay (${clean}).`;
  return `${subject} sẽ đến hạn vào ${clean}.`;
}

export async function syncQualityAttentionForUser(admin: AdminClient, userId: string, year: number) {
  const today = hcmToday();

  const [{ data: profile }, canManageDirectives, canManageReports, canManageRisks, indicatorVerify, indicatorManage, canManageCapa, canManageFeedback, inspectionManage, planManage, canManageFindings] = await Promise.all([
    admin.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle(),
    userHasPermission(admin, userId, "directives.manage"),
    userHasPermission(admin, userId, "reports.manage"),
    userHasPermission(admin, userId, "risk.manage"),
    userHasPermission(admin, userId, "indicators.verify"),
    userHasPermission(admin, userId, "indicators.manage"),
    userHasPermission(admin, userId, "capa.manage"),
    userHasPermission(admin, userId, "feedback.manage"),
    userHasPermission(admin, userId, "inspections.manage"),
    userHasPermission(admin, userId, "plans.manage"),
    userHasPermission(admin, userId, "findings.manage"),
  ]);

  const canVerifyIndicators = indicatorVerify || indicatorManage;
  const canManageInspections = inspectionManage || planManage;
  const primaryDepartmentId = profile?.primary_department_id || null;

  const { data: records, error: recordsError } = await admin.from("records").select("id,record_type,record_code,title,owner_user_id,owner_department_id").eq("work_year", year).eq("lifecycle_status", "ACTIVE");
  if (recordsError) return { error: recordsError.message };
  if (!records?.length) return { created: 0, candidates: 0 };

  const recordIds = records.map((x: any) => x.id);
  const recordMap = new Map(records.map((x: any) => [x.id, x]));
  const mine = (recordId: string, ownerUserId?: string | null, departmentId?: string | null) => {
    const record: any = recordMap.get(recordId);
    return ownerUserId === userId || record?.owner_user_id === userId || (!!primaryDepartmentId && (departmentId === primaryDepartmentId || record?.owner_department_id === primaryDepartmentId));
  };

  const [directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes] = await Promise.all([
    admin.from("external_directives").select("id,record_id,workflow_status,implementation_due_date,report_due_date,lead_department_id,owner_user_id").in("record_id", recordIds),
    admin.from("reporting_obligations").select("id,record_id,workflow_status,due_date,recipient_name,preparing_department_id,preparer_user_id").in("record_id", recordIds),
    admin.from("risks").select("id,record_id,workflow_status,next_review_date,owner_user_id").in("record_id", recordIds),
    admin.from("indicator_measurements").select("id,record_id,workflow_status,result_level,period_end").in("record_id", recordIds),
    admin.from("capas").select("id,record_id,workflow_status,effectiveness_due_date").in("record_id", recordIds),
    admin.from("feedback_records").select("id,record_id,workflow_status,response_due_at").in("record_id", recordIds),
    admin.from("inspection_events").select("id,record_id,workflow_status,visit_date,authority").in("record_id", recordIds),
    admin.from("findings").select("id,record_id,workflow_status,due_date,owner_user_id,severity").in("record_id", recordIds),
  ]);

  const queryErrors = [directivesRes, reportsRes, risksRes, indicatorsRes, capasRes, feedbackRes, inspectionsRes, findingsRes].map((x: any) => x.error?.message).filter(Boolean);

  const payload: any[] = [];
  const add = (recordId: string, type: string, priority: string, title: string, message: string, eventKey: string) => {
    const record: any = recordMap.get(recordId);
    if (!record) return;
    payload.push({
      recipient_user_id: userId,
      notification_type: type,
      priority,
      title,
      message: `${record.record_code || "QARICA"} · ${message}`,
      target_record_id: recordId,
      target_route: routeForRecord(record.record_type, recordId),
      notification_event_key: eventKey,
      is_read: false,
    });
  };

  for (const row of (directivesRes.data ?? []) as any[]) {
    if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageDirectives && !mine(row.record_id, row.owner_user_id, row.lead_department_id)) continue;
    const due = row.report_due_date || row.implementation_due_date;
    const phase = attentionPhaseFor(due, today, ATTENTION_WINDOW_DAYS.directive);
    if (!phase) continue;
    add(row.record_id, `DIRECTIVE_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Chỉ đạo/Yêu cầu quá hạn" : "Chỉ đạo/Yêu cầu sắp đến hạn", attentionDueMessage(phase.phase, due, "Chỉ đạo/Yêu cầu"), `quality:directive:${row.id}:${phase.phase}:due:${String(due).slice(0, 10)}`);
  }

  for (const row of (reportsRes.data ?? []) as any[]) {
    if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageReports && !mine(row.record_id, row.preparer_user_id, row.preparing_department_id)) continue;
    const phase = attentionPhaseFor(row.due_date, today, ATTENTION_WINDOW_DAYS.report);
    if (!phase) continue;
    const recipient = row.recipient_name ? ` Nơi nhận: ${row.recipient_name}.` : "";
    add(row.record_id, `REPORT_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Báo cáo quá hạn" : "Báo cáo sắp đến hạn", `${attentionDueMessage(phase.phase, row.due_date, "Báo cáo")}${recipient}`, `quality:report:${row.id}:${phase.phase}:due:${String(row.due_date).slice(0, 10)}`);
  }

  for (const row of (risksRes.data ?? []) as any[]) {
    if (row.workflow_status === "RETIRED") continue;
    if (!canManageRisks && !mine(row.record_id, row.owner_user_id, null)) continue;
    const phase = attentionPhaseFor(row.next_review_date, today, ATTENTION_WINDOW_DAYS.risk);
    if (!phase) continue;
    add(row.record_id, `RISK_REVIEW_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Rủi ro quá hạn rà soát" : "Rủi ro đến kỳ rà soát", attentionDueMessage(phase.phase, row.next_review_date, "Kỳ rà soát rủi ro"), `quality:risk:${row.id}:${phase.phase}:review:${String(row.next_review_date).slice(0, 10)}`);
  }

  if (canVerifyIndicators) {
    for (const row of (indicatorsRes.data ?? []) as any[]) {
      if (row.workflow_status === "SUBMITTED") {
        add(row.record_id, "INDICATOR_AWAITING_VERIFICATION", "HIGH", "Chỉ số chờ xác minh", "Dữ liệu chỉ số đã được gửi và đang chờ xác minh trước khi khóa.", `quality:indicator:${row.id}:SUBMITTED`);
      }
      if (row.result_level === "OUT_OF_TARGET") {
        const periodKey = row.period_end ? String(row.period_end).slice(0, 10) : "current";
        add(row.record_id, "INDICATOR_OUT_OF_TARGET", "HIGH", "Chỉ số lệch mục tiêu", "Kết quả kỳ đo đang ngoài mục tiêu. Cần xác minh dữ liệu và phân tích nguyên nhân trước khi quyết định Action/CAPA.", `quality:indicator:${row.id}:OUT_OF_TARGET:${periodKey}`);
      }
    }
  }

  if (canManageCapa) {
    for (const row of (capasRes.data ?? []) as any[]) {
      if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      if (row.workflow_status === "EFFECTIVENESS_REVIEW") {
        const phase = attentionPhaseFor(row.effectiveness_due_date, today, ATTENTION_WINDOW_DAYS.capa);
        add(row.record_id, "CAPA_EFFECTIVENESS_REVIEW", phase?.priority || "HIGH", "CAPA chờ đánh giá hiệu lực", row.effectiveness_due_date ? attentionDueMessage(phase?.phase || "DUE_SOON", row.effectiveness_due_date, "Đánh giá hiệu lực CAPA") : "CAPA đã đến bước đánh giá hiệu lực; không đóng nếu chưa chứng minh kết quả thực tế.", `quality:capa:${row.id}:EFFECTIVENESS_REVIEW:${phase?.phase || "ACTIVE"}:${row.effectiveness_due_date || "none"}`);
      } else {
        const phase = attentionPhaseFor(row.effectiveness_due_date, today, ATTENTION_WINDOW_DAYS.capa);
        if (phase) add(row.record_id, `CAPA_EFFECTIVENESS_${phase.phase}`, phase.priority, "CAPA gần hạn đánh giá hiệu lực", attentionDueMessage(phase.phase, row.effectiveness_due_date, "Đánh giá hiệu lực CAPA"), `quality:capa:${row.id}:${phase.phase}:effectiveness:${String(row.effectiveness_due_date).slice(0, 10)}`);
      }
    }
  }

  if (canManageFeedback) {
    for (const row of (feedbackRes.data ?? []) as any[]) {
      if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      const phase = attentionPhaseFor(row.response_due_at, today, ATTENTION_WINDOW_DAYS.feedback);
      if (!phase) continue;
      add(row.record_id, `FEEDBACK_RESPONSE_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Phản ánh quá hạn phản hồi" : "Phản ánh cần phản hồi", attentionDueMessage(phase.phase, row.response_due_at, "Hạn phản hồi"), `quality:feedback:${row.id}:${phase.phase}:response:${String(row.response_due_at).slice(0, 10)}`);
    }
  }

  if (canManageInspections) {
    for (const row of (inspectionsRes.data ?? []) as any[]) {
      if (["COMPLETED", "CANCELLED"].includes(String(row.workflow_status))) continue;
      const phase = attentionPhaseFor(row.visit_date, today, ATTENTION_WINDOW_DAYS.inspection);
      if (!phase) continue;
      const authority = row.authority ? ` Đoàn/cơ quan: ${row.authority}.` : "";
      add(row.record_id, `INSPECTION_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Đợt kiểm tra chưa hoàn tất sau ngày đoàn" : "Tiếp đoàn sắp tới", `${attentionDueMessage(phase.phase, row.visit_date, "Ngày đoàn đến")}${authority}`, `quality:inspection:${row.id}:${phase.phase}:visit:${String(row.visit_date).slice(0, 10)}`);
    }
  }

  for (const row of (findingsRes.data ?? []) as any[]) {
    if (["CLOSED", "CANCELLED"].includes(String(row.workflow_status))) continue;
    if (!canManageFindings && !mine(row.record_id, row.owner_user_id, null)) continue;
    const phase = attentionPhaseFor(row.due_date, today, ATTENTION_WINDOW_DAYS.finding);
    if (!phase) continue;
    const severity = row.severity ? ` Mức: ${row.severity}.` : "";
    add(row.record_id, `FINDING_${phase.phase}`, phase.priority, phase.phase === "OVERDUE" ? "Finding quá hạn" : "Finding sắp đến hạn", `${attentionDueMessage(phase.phase, row.due_date, "Finding")}${severity}`, `quality:finding:${row.id}:${phase.phase}:due:${String(row.due_date).slice(0, 10)}`);
  }

  if (!payload.length) return { created: 0, candidates: 0, warnings: queryErrors.slice(0, 3) };

  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };

  return { created: inserted?.length || 0, candidates: payload.length, warnings: queryErrors.slice(0, 3) };
}

// --- Physician license registration reminders --------------------------------
//
// physician-license-client.tsx only ever showed "Quá hạn" AFTER the deadline
// had already passed (deadline < today, computed client-side) — nothing
// warned proactively while there was still time to act, even though the
// registration windows here are short (10/14/60 ngày) and missing one risks
// BHYT xuất toán. Folded into the same notifications pipeline/thresholds as
// every other due-date reminder rather than inventing a separate mechanism.
export async function syncPhysicianLicenseRemindersForUser(admin: AdminClient, userId: string) {
  if (!(await userHasPermission(admin, userId, "physician_license.manage"))) return { created: 0, candidates: 0 };

  const { data: profile } = await admin.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  if (!profile?.organization_id) return { created: 0, candidates: 0 };

  const { data: registrations, error } = await admin
    .from("physician_license_registrations")
    .select("id,physician_name,deadline")
    .eq("organization_id", profile.organization_id)
    .eq("status", "PENDING");
  if (error) return { error: error.message };
  if (!registrations?.length) return { created: 0, candidates: 0 };

  const today = hcmToday();
  const payload: any[] = [];
  for (const row of registrations as any[]) {
    const phase = attentionPhaseFor(row.deadline, today, 5);
    if (!phase) continue;
    payload.push({
      recipient_user_id: userId,
      notification_type: `PHYSICIAN_LICENSE_${phase.phase}`,
      priority: phase.priority,
      title: phase.phase === "OVERDUE" ? "Đăng ký hành nghề quá hạn" : "Đăng ký hành nghề sắp đến hạn",
      message: `${row.physician_name}: ${attentionDueMessage(phase.phase, row.deadline, "Hạn đăng ký hành nghề")}`,
      target_record_id: null,
      target_route: "/physician-license",
      notification_event_key: `physician_license:${row.id}:${phase.phase}:deadline:${String(row.deadline).slice(0, 10)}`,
      is_read: false,
    });
  }

  if (!payload.length) return { created: 0, candidates: 0 };
  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };
  return { created: inserted?.length || 0, candidates: payload.length };
}

// --- Personal reminders ("Đặt nhắc nhở" cá nhân) -----------------------------
//
// personal_reminders.remind_at was written on create/edit but never read back
// anywhere — a dead feature (CLAUDE.md principle 5). This folds it into the
// same notification pipeline as every other due-date reminder: once remind_at
// has passed for an OPEN reminder, fire one notification keyed by the
// reminder id + its exact remind_at (so editing remind_at produces a fresh
// reminder instead of being silently deduped against the old time).
export async function syncPersonalRemindersForUser(admin: AdminClient, userId: string) {
  const nowIso = new Date().toISOString();
  const { data: reminders, error } = await admin.from("personal_reminders").select("id,title,remind_at,priority").eq("owner_user_id", userId).eq("status", "OPEN").not("remind_at", "is", null).lte("remind_at", nowIso);
  if (error) return { error: error.message };
  if (!reminders?.length) return { created: 0, candidates: 0 };

  const payload = reminders.map((r: any) => ({
    recipient_user_id: userId,
    notification_type: "PERSONAL_REMINDER_DUE",
    priority: r.priority || "NORMAL",
    title: "Nhắc nhở cá nhân",
    message: r.title,
    target_record_id: null,
    target_route: "/dashboard",
    notification_event_key: `personal_reminder:${r.id}:remind_at:${String(r.remind_at)}`,
    is_read: false,
  }));

  const { data: inserted, error: insertError } = await admin.from("notifications").upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true }).select("id");
  if (insertError) return { error: insertError.message };
  return { created: inserted?.length || 0, candidates: payload.length };
}
