import type { SupabaseClient } from "@supabase/supabase-js";
import { hcmToday } from "@/lib/recurring-sync";

type AdminClient = SupabaseClient;

export async function cancelFutureGeneratedOutputs(
  admin: AdminClient,
  templateId: string,
  organizationId: string,
  actorUserId: string,
) {
  const today = hcmToday();
  const { data: futureRuns, error: runsError } = await admin
    .from("recurring_work_runs")
    .select("id,generated_action_id,generated_output_record_id")
    .eq("template_id", templateId)
    .gte("planned_date", today);
  if (runsError) return { cancelled: 0, warnings: [runsError.message] };

  const runs = futureRuns ?? [];
  const runIds = new Set(runs.map((row: any) => row.id).filter(Boolean));
  const actionIds = runs.map((row: any) => row.generated_action_id).filter(Boolean);
  const outputIds = runs.map((row: any) => row.generated_output_record_id).filter(Boolean);
  const recordIds = new Set<string>(outputIds);
  const warnings: string[] = [];

  if (actionIds.length) {
    const { data, error } = await admin.from("actions").select("record_id").in("id", actionIds);
    if (error) warnings.push(`actions: ${error.message}`);
    for (const row of data ?? []) if ((row as any).record_id) recordIds.add((row as any).record_id);
  }

  // Legacy fallback: an actions row can be gone (generated_action_id becomes
  // NULL via FK ON DELETE SET NULL) while the canonical ACTION record remains.
  // Materializers store template/run lineage in record metadata; query by the
  // known template + organization, then keep only records belonging to the
  // future runs currently being cancelled.
  if (runIds.size) {
    const { data, error } = await admin
      .from("records")
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("record_type", "ACTION")
      .eq("lifecycle_status", "ACTIVE")
      .contains("metadata", { recurring_template_id: templateId });
    if (error) warnings.push(`records metadata fallback: ${error.message}`);
    for (const row of data ?? []) {
      const recurringRunId = String((row as any).metadata?.recurring_run_id || "");
      if (recurringRunId && runIds.has(recurringRunId)) recordIds.add((row as any).id);
    }
  }

  // Graph fallback for monitoring outputs. Keep the two relation directions
  // explicit instead of building raw PostgREST OR syntax.
  if (outputIds.length) {
    const [hasAction, materializes] = await Promise.all([
      admin.from("record_links").select("target_record_id").eq("relation_type", "HAS_ACTION").in("source_record_id", outputIds),
      admin.from("record_links").select("source_record_id").eq("relation_type", "MATERIALIZES").in("target_record_id", outputIds),
    ]);
    if (hasAction.error) warnings.push(`HAS_ACTION fallback: ${hasAction.error.message}`);
    if (materializes.error) warnings.push(`MATERIALIZES fallback: ${materializes.error.message}`);
    for (const row of hasAction.data ?? []) if ((row as any).target_record_id) recordIds.add((row as any).target_record_id);
    for (const row of materializes.data ?? []) if ((row as any).source_record_id) recordIds.add((row as any).source_record_id);
  }

  let cancelled = 0;
  for (const recordId of recordIds) {
    const { error } = await admin.rpc("qlcl_change_record_lifecycle_v1", {
      p_record_id: recordId,
      p_actor_user_id: actorUserId,
      p_action: "CANCEL",
      p_reason: "Tự động hủy do mẫu công việc định kỳ nguồn đã bị tắt.",
    });
    if (!error) cancelled += 1;
    else if (!/terminal|closed|cancel/i.test(error.message || "")) warnings.push(`${recordId}: ${error.message}`);
  }
  return { cancelled, warnings: warnings.slice(0, 10) };
}
