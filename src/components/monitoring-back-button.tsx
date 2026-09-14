"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

export function MonitoringBackButton({ roundId }: { roundId: string }) {
  const [open, setOpen] = useState(false);
  const draftKeys = [`monitoring-draft:${roundId}`, `monitoring-recheck-draft:${roundId}`];

  function hasUnsavedDraft() {
    if (typeof window === "undefined") return false;
    return draftKeys.some((key) => {
      try { return !!window.localStorage.getItem(key); } catch { return false; }
    });
  }

  function goToList() {
    window.location.assign("/monitoring");
  }

  function goBack() {
    if (hasUnsavedDraft()) {
      setOpen(true);
      return;
    }
    goToList();
  }

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 18, display: "grid", placeItems: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-monitoring-title" style={{ width: "min(440px, calc(100vw - 36px))", borderRadius: 18 }}>
        <div className="modal-head" style={{ padding: "18px 20px 10px" }}>
          <div>
            <div className="eyebrow" style={{ color: "#b45309" }}>DỮ LIỆU CHƯA LƯU</div>
            <h2 id="leave-monitoring-title" style={{ marginTop: 5 }}>Bạn chưa lưu bảng kiểm</h2>
            <p className="muted" style={{ margin: "6px 0 0", lineHeight: 1.55 }}>Các nội dung vừa nhập chưa được lưu chính thức. Bản nháp vẫn được giữ trên thiết bị này. Bạn muốn tiếp tục rời trang hay ở lại để lưu?</p>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: "12px 20px 18px" }}>
          <button type="button" className="button secondary" onClick={() => setOpen(false)}>Ở lại</button>
          <button type="button" className="button primary" onClick={goToList}>Rời trang</button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return <>
    <button type="button" className="button secondary" onClick={goBack}>← Quay về danh sách</button>
    {modal}
  </>;
}
