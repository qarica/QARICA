import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PRE_DUE_WINDOW_MS = 60 * 1000;

function localTime(value: number) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function userHasPermission(admin: any, userId: string, code: string) {
  const { data: permission } = await admin.from("permissions").select("id").eq("code", code).maybeSingle();
  if (!permission?.id) return false;

  const { data: override } = await admin
    .from("user_permissions")
    .select("is_allowed")
    .eq("user_id", userId)
    .eq("permission_id", permission.id)
    .maybeSingle();
  if (override) return !!override.is_allowed;

  const { data: roles } = await admin.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (roles ?? []).map((x: any) => x.role_id).filter(Boolean);
  if (!roleIds.length) return false;

  const { count } = await admin
    .from("role_permissions")
    .select("role_id", { count: "exact", head: true })
    .in("role_id", roleIds)
    .eq("permission_id", permission.id);
  return (count ?? 0) > 0;
}

async function syncAwaitingConfirmation(admin: any, userId: string, profile: any) {
  if (!profile?.primary_department_id) return 0;
  if (!(await userHasPermission(admin, userId, "checklists.manage"))) return 0;

  const { data: records, error: recordsError } = await admin
    .from("records")
    .select("id,record_code")
    .eq("organization_id", profile.organization_id)
    .eq("owner_department_id", profile.primary_department_id)
    .eq("record_type", "MONITORING")
    .eq("lifecycle_status", "ACTIVE");
  if (recordsError || !records?.length) return 0;

  const recordIds = records.map((x: any) => x.id);
  const { data: rounds, error: roundsError } = await admin
    .from("monitoring_rounds")
    .select("id,record_id,workflow_status")
    .in("record_id", recordIds)
    .eq("workflow_status", "AWAITING_CONFIRMATION");
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

  const { data: inserted } = await admin
    .from("notifications")
    .upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })
    .select("id");
  return inserted?.length || 0;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id,is_active,primary_department_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.organization_id || !profile.is_active) {
    return NextResponse.json({ ok: true, created: 0, pending: 0 });
  }

  const qlclCreated = await syncAwaitingConfirmation(admin, user.id, profile);

  // A user may be the lead assessor or an assigned assessor. The reminder must
  // follow the actual monitoring assignment, not only the lead_assessor_id field.
  const [{ data: leadRounds, error: leadError }, { data: assignments, error: assignmentError }] = await Promise.all([
    admin
      .from("monitoring_rounds")
      .select("id,record_id,lead_assessor_id,workflow_status")
      .eq("lead_assessor_id", user.id)
      .eq("workflow_status", "IN_PROGRESS"),
    admin
      .from("monitoring_assignments")
      .select("monitoring_round_id")
      .eq("user_id", user.id),
  ]);

  if (leadError || assignmentError) {
    return NextResponse.json({ error: leadError?.message || assignmentError?.message || "Không kiểm tra được hạn giám sát." }, { status: 400 });
  }

  const assignedIds = Array.from(new Set((assignments ?? []).map((x) => x.monitoring_round_id).filter(Boolean)));
  const { data: assignedRounds, error: assignedRoundsError } = assignedIds.length
    ? await admin
        .from("monitoring_rounds")
        .select("id,record_id,lead_assessor_id,workflow_status")
        .in("id", assignedIds)
        .eq("workflow_status", "IN_PROGRESS")
    : { data: [], error: null };

  if (assignedRoundsError) {
    return NextResponse.json({ error: assignedRoundsError.message }, { status: 400 });
  }

  const roundMap = new Map<string, any>();
  for (const row of [...(leadRounds ?? []), ...(assignedRounds ?? [])]) roundMap.set(row.id, row);
  const rounds = Array.from(roundMap.values());
  if (!rounds.length) return NextResponse.json({ ok: true, created: qlclCreated, qlcl_created: qlclCreated, pending: 0 });

  const roundIds = rounds.map((r) => r.id);
  const { data: failResponses, error: responsesError } = await admin
    .from("checklist_responses")
    .select("id,monitoring_round_id,answer_value,result_status")
    .in("monitoring_round_id", roundIds)
    .eq("result_status", "FAIL");
  if (responsesError) return NextResponse.json({ error: responsesError.message }, { status: 400 });
  if (!failResponses?.length) return NextResponse.json({ ok: true, created: qlclCreated, qlcl_created: qlclCreated, pending: 0 });

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

  if (!pendingByRound.size) return NextResponse.json({ ok: true, created: qlclCreated, qlcl_created: qlclCreated, pending: 0 });

  const recordIds = rounds.filter((r) => pendingByRound.has(r.id)).map((r) => r.record_id);
  const { data: records, error: recordsError } = await admin
    .from("records")
    .select("id,record_code,organization_id")
    .in("id", recordIds)
    .eq("organization_id", profile.organization_id);
  if (recordsError) return NextResponse.json({ error: recordsError.message }, { status: 400 });

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
        recipient_user_id: user.id,
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
        recipient_user_id: user.id,
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

  if (!payload.length) {
    return NextResponse.json({ ok: true, created: qlclCreated, qlcl_created: qlclCreated, pending: pendingByRound.size });
  }

  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .upsert(payload, { onConflict: "recipient_user_id,notification_event_key", ignoreDuplicates: true })
    .select("id");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    created: (inserted?.length || 0) + qlclCreated,
    qlcl_created: qlclCreated,
    pending: pendingByRound.size,
    overdue: payload.filter((x) => x.notification_type === "MONITORING_RECHECK_OVERDUE").length,
    due_soon: payload.filter((x) => x.notification_type === "MONITORING_RECHECK_DUE_SOON").length,
  });
}
