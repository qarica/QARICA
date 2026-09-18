"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function todayHcm() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function IndicatorPeriodAutoSyncClient({
  year,
  enabled,
}: {
  year: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    const key = `qarica-indicator-period-sync:${year}:${todayHcm()}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "done") return;

    (async () => {
      try {
        const response = await fetch("/api/indicators/sync-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_year: year }),
        });
        const json = await response.json();
        if (!response.ok) return;
        if (typeof window !== "undefined") window.sessionStorage.setItem(key, "done");
        if (Number(json.created_periods || 0) > 0) {
          setMessage(`QARICA vừa tự tạo ${json.created_periods} kỳ đo đến hạn từ cấu hình đã xác nhận.`);
          router.refresh();
        }
      } catch {
        // Silent by design: automatic support must not block the registry page.
      }
    })();
  }, [enabled, router, year]);

  return message ? <div className="alert success">{message}</div> : null;
}
