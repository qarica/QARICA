import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncRecurringTemplateNow } from "@/lib/recurring-sync";

export async function POST(request: Request) {
  const auth = await requireApiPermission("plans.manage");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const templateId = String(body.template_id || "").trim();
  const horizonDays = Math.max(1, Math.min(365, Number(body.horizon_days || 90)));
  if (!templateId) return NextResponse.json({ error: "Thiếu mẫu công việc định kỳ." }, { status: 400 });

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("organization_id,is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (callerError || !caller?.organization_id || !caller.is_active) {
    return NextResponse.json({ error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn tổ chức." }, { status: 403 });
  }

  const result = await syncRecurringTemplateNow({
    admin,
    templateId,
    organizationId: caller.organization_id,
    actorUserId: auth.user.id,
    horizonDays,
  });

  return NextResponse.json(
    result,
    { status: result.ok ? 200 : 409 },
  );
}
