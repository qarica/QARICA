"use client";

import { useState } from "react";

// Mức 1 của đề xuất "đưa ý tưởng Javis OS vào QARICA": báo qua Zalo OA thay/
// kèm chuông in-app cho thông báo mức cao. Chỉ hoạt động sau khi đơn vị vận
// hành QARICA đã tạo Zalo Official Account và cấu hình ZALO_OA_ACCESS_TOKEN
// — nếu chưa, lưu Zalo User ID ở đây vẫn thành công nhưng sẽ không có tin
// nào được gửi (xem src/lib/zalo-oa.ts).
export function ZaloLinkClient({ initialZaloUserId }: { initialZaloUserId: string | null }) {
  const [zaloUserId, setZaloUserId] = useState(initialZaloUserId || "");
  const [saved, setSaved] = useState(initialZaloUserId || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save() {
    const clean = zaloUserId.trim();
    if (!clean) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/me/zalo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zalo_user_id: clean }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không lưu được liên kết Zalo.");
      setSaved(clean);
      setMessage({ tone: "success", text: "Đã lưu liên kết Zalo." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!window.confirm("Bỏ liên kết Zalo? Bạn sẽ không còn nhận thông báo qua Zalo nữa.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/me/zalo", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không bỏ được liên kết.");
      setSaved("");
      setZaloUserId("");
      setMessage({ tone: "success", text: "Đã bỏ liên kết Zalo." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel zalo-link-section">
      <div className="panel-title">
        <div>
          <h2>Kênh thông báo Zalo</h2>
          <p>
            Nhận thêm thông báo khẩn/quan trọng qua Zalo, bên cạnh chuông trên QARICA. Cần nhắn tin trước cho Zalo Official Account
            của đơn vị để Zalo cho phép gửi tin đến bạn.
          </p>
        </div>
        <span className={`status-badge ${saved ? "success" : "muted"}`}>{saved ? "Đã liên kết" : "Chưa liên kết"}</span>
      </div>
      <div className="zalo-link-body">
        {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
        <label>
          <span>Zalo User ID</span>
          <input className="input" value={zaloUserId} onChange={(e) => setZaloUserId(e.target.value)} placeholder="Lấy từ quản trị viên Zalo OA của đơn vị" maxLength={64} />
        </label>
        <div className="zalo-link-actions">
          <button className="button primary small" disabled={busy || !zaloUserId.trim() || zaloUserId.trim() === saved} onClick={() => void save()}>
            {busy ? "Đang lưu..." : "Lưu liên kết"}
          </button>
          {saved ? (
            <button className="button tertiary small" disabled={busy} onClick={() => void unlink()}>
              Bỏ liên kết
            </button>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .zalo-link-body {
          display: grid;
          gap: 12px;
          padding: 0 18px 18px;
        }
        .zalo-link-body > * {
          min-width:0;
        }
        .zalo-link-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>
    </section>
  );
}
