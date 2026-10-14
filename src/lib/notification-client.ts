export async function syncNotifications(): Promise<{ created: number; candidates: number; warnings: string[] }> {
  const response = await fetch("/api/notifications/sync", { method: "POST", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Không đồng bộ được thông báo.");
  return {
    created: Number(body.created || 0),
    candidates: Number(body.candidates || 0),
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
  };
}
