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

  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("organization_id,is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (callerError || !caller?.organization_id || !caller.is_active) {
    return NextResponse.json(
      { error: callerError?.message || "Tài khoản không hợp lệ hoặc chưa gắn tổ chức." },
      { status: 403 },
    );
  }

  if (templateId) {
    const result = await syncRecurringTemplateNow({
      admin,
      templateId,
      organizationId: caller.organization_id,
      actorUserId: auth.user.id,
      horizonDays,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  }

  const { data: templates, error: templatesError } = await admin
    .from("recurring_work_templates")
    .select("id")
    .eq("organization_id", caller.organization_id)
    .eq("is_active", true)
    .order("created_at");

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 400 });
  }

  const ids = (templates ?? []).map((row: any) => String(row.id)).filter(Boolean);
  let createdActions = 0;
  let createdMonitoringRounds = 0;
  let createdReports = 0;
  let createdReminders = 0;
  let existingRuns = 0;
  let skippedTemplates = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  // Small batches keep the "sync all" button responsive without flooding Supabase.
  for (let offset = 0; offset < ids.length; offset += 4) {
    const batch = ids.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async (id) => ({
      id,
      result: await syncRecurringTemplateNow({
        admin,
        templateId: id,
        organizationId: caller.organization_id,
        actorUserId: auth.user.id,
        horizonDays,
      }),
    })));

    for (const { id, result } of results) {
      createdActions += Number(result.createdActions || 0);
      createdMonitoringRounds += Number(result.createdMonitoringRounds || 0);
      createdReports += Number(result.createdReports || 0);
      createdReminders += Number(result.createdReminders || 0);
      existingRuns += Number(result.existing || 0);
      if (result.skipped) skippedTemplates += 1;
      if (!result.ok) {
        errors += Math.max(1, Number(result.errors || 0));
        const details = result.errorDetails?.length ? result.errorDetails : result.error ? [result.error] : ["Không đồng bộ được mẫu."];
        for (const detail of details.slice(0, 3)) {
          if (errorDetails.length >= 20) break;
          errorDetails.push(`${id}: ${detail}`);
        }
      }
    }
  }

  return NextResponse.json({
    ok: errors === 0,
    templates: ids.length,
    created_actions: createdActions,
    created_monitoring_rounds: createdMonitoringRounds,
    created_reports: createdReports,
    created_reminders: createdReminders,
    existing_runs: existingRuns,
    skipped_templates: skippedTemplates,
    errors,
    error_details: errorDetails,
    horizon_days: horizonDays,
  }, { status: errors === 0 ? 200 : 207 });
}
