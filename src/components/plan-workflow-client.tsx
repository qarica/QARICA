"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function PlanWorkflowClient({
  planId,
  currentStatus,
  canManage,
  requiredActions,
  completedActions,
}: {
  planId: string;
  currentStatus: string;
  canManage: boolean;
  requiredActions: number;
  completedActions: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const allRequiredDone = requiredActions > 0 && completedActions >= requiredActions;

  if (!canManage && currentStatus !== "COMPLETED") return null;

  async function run(action: "SUBMIT" | "APPROVE" | "RETURN" | "START" | "HOLD" | "RESUME" | "COMPLETE") {
    let note = "";

    if (action === "SUBMIT" && !window.confirm("Gửi kế hoạch sang bước phê duyệt? Sau khi gửi, kế hoạch sẽ chờ xử lý trước khi được triển khai.")) return;
    if (action === "APPROVE" && !window.confirm("Phê duyệt kế hoạch này?")) return;
    if (action === "START" && !window.confirm("Bắt đầu triển khai kế hoạch? Sau bước này mới được giao nhiệm vụ/Action chính thức.")) return;
    if (action === "HOLD" && !window.confirm("Tạm dừng triển khai kế hoạch này?")) return;
    if (action === "RESUME" && !window.confirm("Tiếp tục triển khai kế hoạch này?")) return;
    if (action === "COMPLETE" && allRequiredDone && !window.confirm("Xác nhận hoàn thành kế hoạch? Kế hoạch sẽ được khóa ở trạng thái Hoàn thành.")) return;

    if (action === "RETURN") {
      const value = window.prompt("Nội dung cần chỉnh sửa trước khi phê duyệt:", "");
      if (value === null) return;
      note = value.trim();
      if (note.length < 5) {
        setMessage("Vui lòng ghi rõ nội dung cần chỉnh sửa.");
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/plans/${planId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không cập nhật được trạng thái kế hoạch.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  let controls: React.ReactNode = null;

  if (currentStatus === "DRAFT") {
    controls = <button type="button" className="button primary" disabled={busy} onClick={() => run("SUBMIT")}><Icon name="send" size={17} /> {busy ? "Đang gửi..." : "Gửi phê duyệt"}</button>;
  } else if (currentStatus === "PENDING_APPROVAL") {
    controls = <>
      <button type="button" className="button secondary" disabled={busy} onClick={() => run("RETURN")}>Trả lại chỉnh sửa</button>
      <button type="button" className="button primary" disabled={busy} onClick={() => run("APPROVE")}><Icon name="check" size={17} /> {busy ? "Đang xử lý..." : "Phê duyệt"}</button>
    </>;
  } else if (currentStatus === "APPROVED") {
    controls = <button type="button" className="button primary" disabled={busy} onClick={() => run("START")}><Icon name="play" size={17} /> {busy ? "Đang cập nhật..." : "Bắt đầu triển khai"}</button>;
  } else if (currentStatus === "IN_PROGRESS") {
    controls = <>
      <button type="button" className="button secondary" disabled={busy} onClick={() => run("HOLD")}>Tạm dừng</button>
      <button
        type="button"
        className="button primary"
        disabled={busy}
        title={!allRequiredDone ? `Chưa đủ điều kiện: mới hoàn thành ${completedActions}/${requiredActions} nhiệm vụ bắt buộc.` : undefined}
        onClick={() => run("COMPLETE")}
      >
        <Icon name="check" size={17} /> {busy ? "Đang kiểm tra..." : "Hoàn thành kế hoạch"}
      </button>
    </>;
  } else if (currentStatus === "ON_HOLD") {
    controls = <button type="button" className="button primary" disabled={busy} onClick={() => run("RESUME")}><Icon name="play" size={17} /> {busy ? "Đang cập nhật..." : "Tiếp tục triển khai"}</button>;
  } else if (currentStatus === "COMPLETED") {
    controls = (
      <div
        role="status"
        aria-label="Kế hoạch đã hoàn thành"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px 9px 10px",
          borderRadius: 14,
          border: "1px solid #86efac",
          background: "linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)",
          color: "#166534",
          boxShadow: "0 4px 14px rgba(22, 101, 52, 0.12)",
          minWidth: 245,
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#16a34a",
            color: "white",
            flexShrink: 0,
          }}
        >
          <Icon name="badge-check" size={20} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.25 }}>
          <strong style={{ fontSize: 13, letterSpacing: ".01em" }}>KẾ HOẠCH ĐÃ HOÀN THÀNH</strong>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#15803d" }}>
            100% · {completedActions}/{requiredActions} nhiệm vụ bắt buộc
          </span>
        </span>
      </div>
    );
  }

  if (!controls && !message) return null;

  return <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
    {message ? <span className="tiny" style={{ color: "#b42318" }}>{message}</span> : null}
    {controls}
  </div>;
}
