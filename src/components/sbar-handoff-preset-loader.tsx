"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function isSbarHandoffTemplate(name: string) {
  const normalized = name.trim().toLocaleLowerCase("vi-VN");
  return normalized.includes("sbar") || (normalized.includes("bàn giao") && normalized.includes("giường"));
}

export function SbarHandoffPresetLoader({
  templateId,
  templateName,
  versionId,
  versionStatus,
  sectionCount,
  itemCount,
  canManage,
}: {
  templateId: string;
  templateName: string;
  versionId: string | null;
  versionStatus: string | null;
  sectionCount: number;
  itemCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const attempted = useRef(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const shouldSync = canManage && isSbarHandoffTemplate(templateName) && !!versionId && versionStatus === "DRAFT";
    if (!shouldSync || attempted.current) return;
    attempted.current = true;
    setState("loading");

    void fetch(`/api/monitoring/templates/${templateId}/preset-sbar-handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể đồng bộ nội dung bảng kiểm bàn giao SBAR.");
        setState("idle");
        if (data.changed || (sectionCount === 0 && itemCount === 0)) router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Không thể đồng bộ nội dung bảng kiểm bàn giao SBAR.");
        setState("error");
      });
  }, [canManage, itemCount, router, sectionCount, templateId, templateName, versionId, versionStatus]);

  if (state === "loading" && sectionCount === 0 && itemCount === 0) {
    return <div className="alert success">Đang tự động nạp cấu trúc bàn giao người bệnh theo SBAR (S/B/A/R) từ bộ thông tin đã xác nhận…</div>;
  }
  if (state === "error") {
    return <div className="alert error">Không đồng bộ được cấu trúc SBAR: {error}</div>;
  }
  return null;
}
