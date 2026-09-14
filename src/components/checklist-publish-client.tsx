"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function ChecklistPublishClient({
  templateId,
  versionId,
  versionStatus,
  itemCount,
  canManage,
}: {
  templateId: string;
  versionId: string | null;
  versionStatus: string | null;
  itemCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!canManage || !versionId || versionStatus !== "DRAFT") return null;

  async function publish() {
    if (!itemCount) return setMessage({ tone: "error", text: "Phiên bản chưa có tiêu chí để phát hành." });
    if (!window.confirm("Phát hành phiên bản này? Sau khi phát hành, nội dung v1 sẽ được khóa để bảo toàn lịch sử giám sát.")) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/monitoring/templates/${templateId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể phát hành bảng kiểm.");
      setMessage({ tone: "success", text: "Đã phát hành v1. Nội dung đã được khóa và có thể sử dụng cho đợt giám sát thật." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" style={{ padding: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div className="eyebrow">HOÀN TẤT CẤU HÌNH PHIÊN BẢN</div>
        <h2 style={{ margin: "5px 0 6px" }}>Phát hành bảng kiểm</h2>
        <p className="muted" style={{ margin: 0 }}>Chỉ phát hành sau khi nội dung và màn hình thực hiện đã được kiểm tra. Sau phát hành, v1 không chỉnh sửa trực tiếp nữa.</p>
      </div>
      <button className="button primary" disabled={busy} onClick={publish}><Icon name="shield-check" size={17} /> {busy ? "Đang phát hành..." : "Phát hành v1"}</button>
    </div>
    {message ? <div className={`alert ${message.tone}`} style={{ marginTop: 14 }}>{message.text}</div> : null}
  </section>;
}
