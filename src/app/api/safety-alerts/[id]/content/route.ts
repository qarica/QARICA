import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (value: unknown) => String(value ?? "").trim();

async function context(recordId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };

  const [{ data: investigate }, { data: close }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission_code: "incident.investigate" }),
    supabase.rpc("has_permission", { p_permission_code: "incident.close" }),
  ]);
  if (!investigate && !close) return { ok: false as const, response: NextResponse.json({ error: "Bạn chưa có quyền soạn bài học/cảnh báo." }, { status: 403 }) };

  const { data: visible } = await supabase.from("records").select("id").eq("id", recordId).eq("record_type", "SAFETY_ALERT").maybeSingle();
  if (!visible) return { ok: false as const, response: NextResponse.json({ error: "Không tìm thấy bài học/cảnh báo." }, { status: 404 }) };

  const admin = createAdminClient();
  const [{ data: record }, { data: alert }] = await Promise.all([
    admin.from("records").select("id,lifecycle_status").eq("id", recordId).eq("record_type", "SAFETY_ALERT").maybeSingle(),
    admin.from("safety_alerts").select("id,status,summary,lesson,recommendation,expires_at").eq("record_id", recordId).maybeSingle(),
  ]);
  if (!record || !alert) return { ok: false as const, response: NextResponse.json({ error: "Thiếu dữ liệu bài học/cảnh báo." }, { status: 404 }) };
  return { ok: true as const, admin, user: auth.user, record, alert };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({
    status: ctx.alert.status,
    summary: ctx.alert.summary ?? "",
    lesson: ctx.alert.lesson ?? "",
    recommendation: ctx.alert.recommendation ?? "",
    expires_at: ctx.alert.expires_at ?? null,
    editable: ctx.record.lifecycle_status === "ACTIVE" && ctx.alert.status === "DRAFT",
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: recordId } = await params;
  const ctx = await context(recordId);
  if (!ctx.ok) return ctx.response;
  if (ctx.record.lifecycle_status !== "ACTIVE" || ctx.alert.status !== "DRAFT") {
    return NextResponse.json({ error: "Chỉ được chỉnh sửa bài học/cảnh báo khi hồ sơ còn Nháp. Bản đang rà soát hoặc đã phát hành phải giữ nguyên nội dung." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const summary = text(body.summary);
  const lesson = text(body.lesson);
  const recommendation = text(body.recommendation);
  const rawExpiresAt = text(body.expires_at);
  let expiresAt: string | null = null;
  if (rawExpiresAt) {
    const parsed = new Date(rawExpiresAt);
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Thời điểm hết hiệu lực không hợp lệ." }, { status: 400 });
    expiresAt = parsed.toISOString();
  }

  const oldValue = {
    summary: ctx.alert.summary ?? null,
    lesson: ctx.alert.lesson ?? null,
    recommendation: ctx.alert.recommendation ?? null,
    expires_at: ctx.alert.expires_at ?? null,
  };
  const newValue = { summary: summary || null, lesson: lesson || null, recommendation: recommendation || null, expires_at: expiresAt };
  const now = new Date().toISOString();
  const { error } = await ctx.admin.from("safety_alerts").update({ ...newValue, updated_at: now }).eq("id", ctx.alert.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await ctx.admin.from("audit_logs").insert({
    actor_user_id: ctx.user.id,
    record_id: recordId,
    table_name: "safety_alerts",
    row_id: ctx.alert.id,
    action_type: "SAFETY_ALERT_DRAFT_EDIT",
    old_value: oldValue,
    new_value: newValue,
    request_meta: { source: "qlcl-ui" },
  });

  return NextResponse.json({ ok: true, message: "Đã lưu nội dung nháp cảnh báo." });
}
