"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReminderRowDelete({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Xóa note cá nhân "${title}"? Không thể hoàn tác.`)) return;
    setBusy(true);
    const { error } = await supabase.from("personal_reminders").delete().eq("id", id);
    setBusy(false);
    if (error) { window.alert(error.message); return; }
    router.refresh();
  }

  return <button type="button" className="button tertiary small" onClick={remove} disabled={busy}>{busy ? "Đang xóa..." : "Xóa"}</button>;
}
