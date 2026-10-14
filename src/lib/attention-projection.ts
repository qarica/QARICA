import { routeForRecord } from "@/lib/record-route";
import { visibleNavGroups } from "@/lib/navigation";
import { workspaceRootForPath } from "@/lib/workspace-navigation";
import type { UserContext } from "@/lib/types";
import { isOperationallyHiddenStatus } from "@/lib/operational-record";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AttentionState = Record<string, { count: number; urgent: boolean }>;

function normalizeVisibleRoute(route: string | null, user: UserContext) {
  if (!route) return null;
  const base = route.split("?")[0];
  const groups = visibleNavGroups(user);
  const roots = new Set(groups.flatMap((g) => g.children.map((x) => x.workspaceRoot || x.href.split("?")[0])));
  const workspace = workspaceRootForPath(base);
  if (workspace && roots.has(workspace)) return workspace;
  return [...roots].sort((a, b) => b.length - a.length).find((root) => base === root || base.startsWith(`${root}/`)) ?? null;
}

export async function buildAttentionProjection(supabase: SupabaseClient, user: UserContext): Promise<AttentionState> {
  const { data: notices, error } = await supabase
    .from("notifications")
    .select("id,priority,target_record_id,target_route,created_at")
    .eq("recipient_user_id", user.id)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const recordIds = Array.from(new Set((notices ?? []).map((n: any) => n.target_record_id).filter(Boolean)));
  const { data: records, error: recordError } = recordIds.length
    ? await supabase.from("records").select("id,record_type,lifecycle_status").in("id", recordIds)
    : { data: [] as any[], error: null };
  if (recordError) throw new Error(recordError.message);
  const visibleRecords = (records ?? []).filter((r: any) => !isOperationallyHiddenStatus(r.lifecycle_status));
  const visibleRecordIds = new Set(visibleRecords.map((r: any) => r.id));
  const recordTypeById = new Map(visibleRecords.map((r: any) => [r.id, r.record_type]));

  const buckets = new Map<string, { keys: Set<string>; urgent: boolean }>();
  for (const notice of notices ?? []) {
    const n = notice as any;
    if (n.target_record_id && !visibleRecordIds.has(n.target_record_id)) continue;
    const fallback = n.target_record_id && recordTypeById.get(n.target_record_id)
      ? routeForRecord(String(recordTypeById.get(n.target_record_id)), n.target_record_id)
      : null;
    const root = normalizeVisibleRoute(n.target_route || fallback, user);
    if (!root) continue;
    const bucket = buckets.get(root) ?? { keys: new Set<string>(), urgent: false };
    bucket.keys.add(n.target_record_id ? `record:${n.target_record_id}` : `notice:${n.id}`);
    bucket.urgent = bucket.urgent || ["HIGH", "URGENT", "CRITICAL"].includes(String(n.priority || "").toUpperCase());
    buckets.set(root, bucket);
  }

  const state: AttentionState = {};
  buckets.forEach((value, route) => { state[route] = { count: value.keys.size, urgent: value.urgent }; });
  return state;
}
