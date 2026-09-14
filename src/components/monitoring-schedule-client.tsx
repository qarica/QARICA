"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function MonitoringScheduleClient({ versionId, canPerform }: { versionId: string | null; canPerform: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!versionId || !canPerform) return null;

  async function createRound() {
    setMessage(null);
    if (!date) return setMessage("Vui lòng chọn ngày giám sát.");
    setBusy(true);
    try {
      const res = await fetch("/api/monitoring/rounds/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, scheduled_date: date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo đợt giám sát.");
      router.push(`/monitoring/${data.round_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div
      onClick={() => { if (!busy) setOpen(false); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1600,
        display: "grid",
        placeItems: "center",
        padding: "max(18px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom))",
        background: "rgba(19, 35, 40, .46)",
        backdropFilter: "blur(2px)",
        overflowY: "auto",
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(470px, calc(100vw - 28px))",
          maxHeight: "calc(100dvh - 36px)",
          overflow: "hidden",
          borderRadius: 22,
          boxShadow: "0 24px 64px rgba(16, 39, 44, .22)",
        }}
      >
        <div className="modal-head" style={{ padding: "18px 20px 14px", alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">ĐỢT GIÁM SÁT MỚI</div>
            <h2 style={{ marginTop: 4 }}>Chọn ngày thực hiện</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45 }}>
              Đợt mới sẽ ở trạng thái <strong>Cần kiểm</strong>. Mở mã đợt để bắt đầu chấm.
            </p>
          </div>
          <button className="icon-button" disabled={busy} onClick={() => setOpen(false)} aria-label="Đóng"><Icon name="x" size={20} /></button>
        </div>

        <div className="modal-body" style={{ padding: "18px 20px 20px", overflowY: "auto" }}>
          {message ? <div className="alert error" style={{ marginBottom: 12 }}>{message}</div> : null}
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>Ngày giám sát *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 52, fontSize: 16 }} />
          </label>
        </div>

        <div className="modal-footer" style={{ padding: "14px 20px 18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.45fr)", gap: 10 }}>
          <button className="button secondary" style={{ width: "100%" }} disabled={busy} onClick={() => setOpen(false)}>Hủy</button>
          <button className="button primary" style={{ width: "100%" }} disabled={busy} onClick={createRound}>{busy ? "Đang tạo..." : "Tạo đợt giám sát"}</button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return <>
    <button className="button primary" onClick={() => { setMessage(null); setOpen(true); }}><Icon name="plus" size={17} /> Tạo đợt giám sát</button>
    {modal}
  </>;
}
