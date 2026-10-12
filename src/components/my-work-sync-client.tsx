"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncNotifications } from "@/lib/notification-client";

const RESYNC_INTERVAL_MS = 60_000;

export function MyWorkSyncClient() {
  const router = useRouter();
  const cancelledRef = useRef(false);

  const sync = useCallback(async () => {
    try {
      const result = await syncNotifications();
      if (!cancelledRef.current && result.created > 0) router.refresh();
    } catch (error) {
      // Keep the work view usable, but never hide synchronization failures from diagnostics.
      console.error("[MyWorkSync] notification sync failed", error instanceof Error ? error.message : "Unknown error");
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
