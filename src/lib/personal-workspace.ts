export type WorkspaceItem = { id: string; item_type: "TASK" | "NOTE"; deleted_at?: string | null; title: string };

/** The server can send pre-migration rows; absence of deleted_at means active. */
export function activeItems<T extends WorkspaceItem>(rows: readonly T[]): T[] {
  return rows.filter((row) => !row.deleted_at);
}

export function deletedItems<T extends WorkspaceItem>(rows: readonly T[]): T[] {
  return rows.filter((row) => Boolean(row.deleted_at));
}

/** Merge the latest server page with locally retained records without duplicates. */
export function mergeWorkspaceItems<T extends WorkspaceItem>(fresh: readonly T[], retained: readonly T[]): T[] {
  const ids = new Set(fresh.map((item) => item.id));
  return [...fresh, ...retained.filter((item) => !ids.has(item.id))];
}

/** Calendar-only due dates represent midnight in Vietnam, independent of browser timezone. */
export function vietnamDateToIso(date: string): string | null {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = new Date(parsed.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return normalized === date ? parsed.toISOString() : null;
}
