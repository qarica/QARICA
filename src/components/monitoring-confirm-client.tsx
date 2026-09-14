"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function MonitoringConfirmClient({ roundId, status, canConfirm }: { roundId: string; status: string; canConfirm: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!canConfirm || status !== "AWAITING_CONFIRMATION") return null;

  async function confirmRound() {
    if (!window.confirm("Xác nhận kết quả giám sát này với tư cách Phòng QLCL?")) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/monitoring/rounds/${roundId}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể xác nhận đợt giám sát.");
      setMessage({ tone: "success", text: "Phòng QLCL đã xác nhận kết quả giám sát." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" style={{ padding: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div><div className="eyebrow">XÁC NHẬN PHÒNG QLCL</div><h2 style={{ margin: "5px 0 6px" }}>Hồ sơ đang chờ xác nhận</h2><p className="muted" style={{ margin: 0 }}>Xác nhận sau khi rà soát kết quả, ghi chú và thông tin khắc phục của các nội dung Không đạt.</p></div>
      <button className="button primary" disabled={busy} onClick={confirmRound}><Icon name="badge-check" size={17} /> {busy ? "Đang xác nhận..." : "Xác nhận Phòng QLCL"}</button>
    </div>
    {message ? <div className={`alert ${message.tone}`} style={{ marginTop: 14 }}>{message.text}</div> : null}
  </section>;
}
