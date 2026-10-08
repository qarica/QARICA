"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Real finding: this used to sync exactly once on mount — if a tab stayed
// open across a deadline, "Việc của tôi" silently drifted out of sync with
// reality until the user manually reloaded. Now mirrors notification-bell.tsx's
// own polling convention (periodic interval + resync when the tab becomes
// visible again) instead of a single fire-and-forget run.
const RESYNC_INTERVAL_MS = 60_000;

export function MyWorkSyncClient() {
  const router = useRouter();
  const cancelledRef = useRef(false);

  const sync = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetch("/api/notifications/sync-quality-attention", { method: "POST", cache: "no-store" }),
        fetch("/api/notifications/sync-action-reminders", { method: "POST", cache: "no-store" }),
        fetch("/api/notifications/sync-monitoring-overdue", { method: "POST", cache: "no-store" }),
        fetch("/api/notifications/sync-emr-reminders", { method: "POST", cache: "no-store" }),
        fetch("/api/notifications/sync-physician-license-reminders", { method: "POST", cache: "no-store" }),
      ]);
      let created = 0;
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.ok) continue;
        const body = await result.value.json().catch(() => null);
        created += Number(body?.created || 0);
      }
      if (!cancelledRef.current && created > 0) router.refresh();
    } catch {
      // Việc của tôi vẫn sử dụng dữ liệu hiện có nếu đồng bộ attention tạm thời lỗi.
    }
  }, [router]);

  useEffect(() => {
    cancelledRef.current = false;
    void sync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, RESYNC_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sync]);

  return null;
}
