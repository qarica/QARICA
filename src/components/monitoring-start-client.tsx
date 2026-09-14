"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function MonitoringStartClient({ roundId, canPerform }: { roundId: string; canPerform: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!canPerform) return null;

  async function start() {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/monitoring/rounds/${roundId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể bắt đầu đợt giám sát.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" style={{ padding: 18 }}>
    <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div><div className="eyebrow">TRẠNG THÁI · CẦN KIỂM</div><h2 style={{ margin: "4px 0 6px" }}>Đợt đã được tạo nhưng chưa bắt đầu chấm</h2><p className="muted" style={{ margin: 0 }}>Khi bấm bắt đầu, trạng thái chuyển sang <strong>Đang kiểm</strong> và chỉ màn hình thao tác bảng kiểm được mở.</p></div>
      <button className="button primary" disabled={busy} onClick={start}><Icon name="check-square" size={17} /> {busy ? "Đang mở..." : "Bắt đầu kiểm"}</button>
    </div>
    {message ? <div className="alert error" style={{ marginTop: 12 }}>{message}</div> : null}
  </section>;
}
