"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EvidenceDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Xoá minh chứng "${title}"? Không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/evidence/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Không xoá được.");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" className="button tertiary small" onClick={remove} disabled={busy}>{busy ? "Đang xoá..." : "Xoá"}</button>;
}
