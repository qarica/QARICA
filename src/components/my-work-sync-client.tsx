"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function MyWorkSyncClient() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    async function sync() {
      try {
        const results = await Promise.allSettled([
          fetch("/api/notifications/sync-quality-attention", { method: "POST", cache: "no-store" }),
          fetch("/api/notifications/sync-action-reminders", { method: "POST", cache: "no-store" }),
          fetch("/api/notifications/sync-monitoring-overdue", { method: "POST", cache: "no-store" }),
        ]);
        let created = 0;
        for (const result of results) {
          if (result.status !== "fulfilled" || !result.value.ok) continue;
          const body = await result.value.json().catch(() => null);
          created += Number(body?.created || 0);
        }
        if (!cancelled && created > 0) router.refresh();
      } catch {
        // Việc của tôi vẫn sử dụng dữ liệu hiện có nếu đồng bộ attention tạm thời lỗi.
      }
    }

    void sync();
    return () => { cancelled = true; };
  }, [router]);

  return null;
}
