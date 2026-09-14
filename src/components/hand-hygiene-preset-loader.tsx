"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function isHandHygieneTemplate(name: string) {
  const normalized = name.trim().toLocaleLowerCase("vi-VN");
  return normalized.includes("vệ sinh tay") && normalized.includes("tuân thủ");
}

export function HandHygienePresetLoader({
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
    const shouldSync = canManage && isHandHygieneTemplate(templateName) && !!versionId && versionStatus === "DRAFT";
    if (!shouldSync || attempted.current) return;
    attempted.current = true;
    setState("loading");

    void fetch(`/api/monitoring/templates/${templateId}/preset-hand-hygiene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể đồng bộ nội dung bảng kiểm vệ sinh tay.");
        setState("idle");
        if (data.changed || (sectionCount === 0 && itemCount === 0)) router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Không thể đồng bộ nội dung bảng kiểm vệ sinh tay.");
        setState("error");
      });
  }, [canManage, itemCount, router, sectionCount, templateId, templateName, versionId, versionStatus]);

  if (state === "loading" && sectionCount === 0 && itemCount === 0) {
    return <div className="alert success">Đang tự động nạp cấu trúc giám sát vệ sinh tay từ bộ thông tin đã xác nhận…</div>;
  }
  if (state === "error") {
    return <div className="alert error">Không đồng bộ được cấu trúc vệ sinh tay: {error}</div>;
  }
  return null;
}
