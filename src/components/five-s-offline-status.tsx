"use client";

import { useEffect, useState } from "react";

// Đăng ký service worker phạm vi hẹp (chỉ /monitoring/) để giữ app-shell khi
// mất sóng tạm thời trong lúc đi giám sát 5S, và hiện banner khi đang offline.
// KHÔNG lưu offline kết quả chấm điểm — xem ghi chú phạm vi trong public/sw-5s.js.
export function FiveSOfflineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw-5s.js", { scope: "/monitoring/" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="alert warning" role="status" style={{ marginBottom: 10 }}>
      <strong>Đang mất kết nối mạng.</strong> Bạn đang xem bản đã tải trước đó; kết quả chấm điểm mới sẽ KHÔNG lưu được cho đến khi có mạng trở lại — vui lòng thử lại khi kết nối phục hồi.
    </div>
  );
}
