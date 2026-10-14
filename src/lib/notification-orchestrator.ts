import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncActionRemindersForUser,
  syncEmrRemindersForUser,
  syncMonitoringOverdueForUser,
  syncPersonalRemindersForUser,
  syncPhysicianLicenseRemindersForUser,
  syncQualityAttentionForUser,
} from "@/lib/notification-sync";

type AdminClient = SupabaseClient;

type SyncResult = { created?: number; candidates?: number; pending?: number; warnings?: string[]; error?: string };

export async function syncAllNotificationsForUser(admin: AdminClient, userId: string, year: number) {
  const jobs: Array<[string, () => Promise<SyncResult>]> = [
    ["quality", () => syncQualityAttentionForUser(admin, userId, year)],
    ["actions", () => syncActionRemindersForUser(admin, userId, year)],
    ["monitoring", () => syncMonitoringOverdueForUser(admin, userId)],
    ["emr", () => syncEmrRemindersForUser(admin, userId)],
    ["physician_license", () => syncPhysicianLicenseRemindersForUser(admin, userId)],
    ["personal_reminders", () => syncPersonalRemindersForUser(admin, userId)],
  ];

  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  let created = 0;
  let candidates = 0;
  const warnings: string[] = [];
  const modules: Record<string, { created: number; candidates: number; ok: boolean }> = {};

  settled.forEach((result, index) => {
    const name = jobs[index][0];
    if (result.status === "rejected") {
      warnings.push(`${name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      modules[name] = { created: 0, candidates: 0, ok: false };
      return;
    }
    const value = result.value || {};
    const moduleCreated = Number(value.created || 0);
    const moduleCandidates = Number(value.candidates || value.pending || 0);
    created += moduleCreated;
    candidates += moduleCandidates;
    modules[name] = { created: moduleCreated, candidates: moduleCandidates, ok: !value.error };
    if (value.error) warnings.push(`${name}: ${value.error}`);
    for (const warning of value.warnings || []) warnings.push(`${name}: ${warning}`);
  });

  return { created, candidates, warnings: warnings.slice(0, 10), modules };
}
