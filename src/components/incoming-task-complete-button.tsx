"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Hoàn tất / mở lại việc giao từ công văn đến ngay trong Việc của tôi (module công văn tự cập nhật vì dùng chung một bảng). */
export function IncomingTaskCompleteButton({ id, isDone }: { id: string; isDone: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/work/incoming-task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, completed: !isDone }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không cập nhật được.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className="button secondary small" disabled={busy || pending} onClick={() => void toggle()} title={isDone ? "Mở lại công việc này" : "Đánh dấu đã hoàn thành (cập nhật cả trong module Công văn đến)"}>
        {busy || pending ? "Đang cập nhật..." : isDone ? "Mở lại" : "Hoàn tất"}
      </button>
      {error ? <small role="alert" style={{ color: "#b91c1c" }}>{error}</small> : null}
    </span>
  );
}
