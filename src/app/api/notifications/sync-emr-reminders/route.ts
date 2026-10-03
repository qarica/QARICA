import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EMR_CATEGORIES } from "@/lib/emr-categories";

// Modeled directly on sync-action-reminders/route.ts's phase thresholds —
// same reminder cadence (quá hạn nghiêm trọng/cần đôn đốc/quá hạn/đến hạn
// hôm nay/sắp đến hạn) so EMR due-date reminders feel consistent with every
// other module instead of inventing a second urgency scale.
function reminderPhase(days: number | null) {
  if (days === null) return null;
  if (days <= -7) return { code: "OVERDUE_7", priority: "CRITICAL", title: "Hạng mục EMR quá hạn nghiêm trọng" };
  if (days <= -3) return { code: "OVERDUE_3", priority: "URGENT", title: "Hạng mục EMR cần đôn đốc" };
  if (days < 0) return { code: "OVERDUE", priority: "URGENT", title: "Hạng mục EMR đã quá hạn" };
  if (days === 0) return { code: "DUE_TODAY", priority: "HIGH", title: "Hạng mục EMR đến hạn hôm nay" };
  if (days <= 3) return { code: "DUE_SOON", priority: "HIGH", title: "Hạng mục EMR sắp đến hạn" };
  return null;
}

function reminderMessage(days: number, categoryLabel: string, title: string) {
  const prefix = `${categoryLabel} · `;
  if (days <= -7) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần xử lý hoặc báo cáo vướng mắc ngay.`;
  if (days <= -3) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Cần đôn đốc và cập nhật tiến độ.`;
  if (days < 0) return `${prefix}${title} đã quá hạn ${Math.abs(days)} ngày. Ưu tiên xử lý trước công việc mới.`;
  if (days === 0) return `${prefix}${title} đến hạn hôm nay. Cần hoàn tất hoặc cập nhật tiến độ trước cuối ngày.`;
  return `${prefix}${title} còn ${days} ngày đến hạn. Chủ động chuẩn bị để tránh quá hạn.`;
}

// Certificate expiry (Chữ ký số) is a second due-date-like field living in
// `details.certificate_expiry` rather than the generic `due_date` column —
// fed through the SAME reminder sync route/notification_type family instead
// of a separate certificate-specific mechanism, per the one-source-of-truth
// rule (a form has no due_date but is still status-tracked; a signature
// item is tracked here by its own expiry, regardless of its status).
function certPhase(days: number | null) {
  if (days === null) return null;
  if (days < 0) return { code: "CERT_EXPIRED", priority: "CRITICAL", title: "Chữ ký số đã hết hạn" };
  if (days <= 30) return { code: "CERT_EXPIRING", priority: "HIGH", title: "Chữ ký số sắp hết hạn" };
  return null;
}

function certMessage(days: number, title: string) {
  if (days < 0) return `${title}: chứng thư chữ ký số đã hết hạn ${Math.abs(days)} ngày. Cần gia hạn/cấp lại ngay.`;
  return `${title}: chứng thư chữ ký số còn ${days} ngày là hết hạn. Chủ động gia hạn trước khi hết hạn.`;
}

function daysBetween(todayKey: string, dateKey: string) {
  return Math.round((Date.parse(dateKey) - Date.parse(todayKey)) / 86400000);
}

type NotificationPayload = {
  recipient_user_id: string;
  notification_type: string;
  priority: string;
  title: string;
  message: string;
  target_record_id: null;
  target_route: string;
  notification_event_key: string;
  is_read: boolean;
};

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const userId = auth.user.id;

  // "Người phụ trách" (a single person) was replaced by "Đơn vị phụ trách"
  // (owner_department_id) — reminders now go to the HEAD/QUALITY_NETWORK_MEMBER
  // of that department, the same department-wide escalation audience
  // sync-action-reminders already uses for DEPARTMENT-assigned Actions,
  // rather than a single named owner.
  const { data: profile } = await supabase.from("profiles").select("primary_department_id").eq("user_id", userId).maybeSingle();
  const primaryDepartmentId = profile?.primary_department_id || null;
  let items: { id: string; category: string; title: string; status: string; due_date: string | null; details: Record<string, unknown> | null }[] = [];
  if (primaryDepartmentId) {
    const { data: roles, error: rolesError } = await supabase.from("department_user_roles").select("role_type").eq("department_id", primaryDepartmentId).eq("user_id", userId).eq("is_active", true).in("role_type", ["HEAD", "QUALITY_NETWORK_MEMBER"]);
    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 400 });
    if ((roles ?? []).length) {
      const { data, error } = await supabase
        .from("emr_rollout_items")
        .select("id,category,title,status,due_date,owner_department_id,details")
        .eq("owner_department_id", primaryDepartmentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      items = data ?? [];
    }
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const payload: NotificationPayload[] = [];

  for (const item of items) {
    const category = EMR_CATEGORIES.find((c) => c.code === item.category);
    const categoryLabel = category?.label || String(item.category);
    const route = category ? `/emr/${category.slug}` : "/emr";

    if (item.status !== "DONE" && item.due_date) {
      const dueKey = String(item.due_date).slice(0, 10);
      const phase = reminderPhase(daysBetween(todayKey, dueKey));
      if (phase) {
        payload.push({
          recipient_user_id: userId,
          notification_type: `EMR_ITEM_${phase.code}`,
          priority: phase.priority,
          title: phase.title,
          message: reminderMessage(daysBetween(todayKey, dueKey), categoryLabel, item.title),
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
      const phase = certPhase(days);
      if (phase) {
        payload.push({
          recipient_user_id: userId,
          notification_type: `EMR_${phase.code}`,
          priority: phase.priority,
          title: phase.title,
          message: certMessage(days, item.title),
          target_record_id: null,
          target_route: "/emr/chu-ky-so",
          notification_event_key: `emr_item:${userId}:${item.id}:cert_expiry:${expiryKey}:phase:${phase.code}`,
          is_read: false,
        });
      }
    }
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
