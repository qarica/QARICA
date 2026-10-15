"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icon";

type Mode = "NOTE" | "TASK";

// Floating quick-capture button, rendered once in (app)/layout.tsx so it is
// present on every screen regardless of which module is open — explicit
// request: "Sổ tay cá nhân" (ghi chú) và việc cần làm phải ghi được ngay từ
// bất kỳ màn hình nào, không phải điều hướng sang /me hay /tasks trước.
// Note creation reuses the same POST /api/knowledge contract as
// KnowledgeJournalClient; task creation reuses the same personal_reminders
// insert shape as PersonalReminders (both already RLS-scoped, no new route).
export function GlobalQuickCapture({ userId, organizationId }: { userId: string; organizationId: string | null }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("NOTE");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedHref, setSavedHref] = useState<string | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    function onClickOutside(event: MouseEvent) { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClickOutside);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClickOutside); };
  }, [open]);

  function resetForm() { setTitle(""); setContent(""); setDue(""); setError(""); setSavedHref(null); }
  function switchMode(next: Mode) { setMode(next); resetForm(); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true); setError(""); setSavedHref(null);
    try {
      if (mode === "NOTE") {
        const res = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note_type: "NOTE", visibility: "PRIVATE", title: clean, content: content.trim() || null, journal_date: null }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body.error || "Không lưu được ghi chú.");
        setSavedHref("/me#knowledge-journal");
      } else {
        if (!organizationId) throw new Error("Tài khoản chưa thuộc tổ chức nào, không thể thêm việc cá nhân.");
        const dueAt = due ? new Date(`${due}T00:00:00`) : new Date(Date.now() + 7 * 86400000);
        const { error: insertError } = await supabase.from("personal_reminders").insert({ organization_id: organizationId, owner_user_id: userId, title: clean, priority: "NORMAL", category: "KHAC", due_at: dueAt.toISOString() });
        if (insertError) throw new Error(insertError.message);
        setSavedHref("/tasks");
      }
      setTitle(""); setContent(""); setDue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="global-quick-capture" ref={rootRef}>
    {open ? <div className="gqc-panel" role="dialog" aria-label="Ghi nhanh ghi chú hoặc việc cần làm">
      <div className="gqc-head">
        <div className="gqc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "NOTE"} className={mode === "NOTE" ? "active" : ""} onClick={() => switchMode("NOTE")}>Ghi chú</button>
          <button type="button" role="tab" aria-selected={mode === "TASK"} className={mode === "TASK" ? "active" : ""} onClick={() => switchMode("TASK")}>Việc cần làm</button>
        </div>
        <div className="gqc-head-actions">
          <Link href="/me" className="gqc-open-full" onClick={() => setOpen(false)} title="Mở sổ tay cá nhân đầy đủ" aria-label="Mở sổ tay cá nhân đầy đủ"><Icon name="book-open" size={16} /></Link>
          <button type="button" className="gqc-close" aria-label="Đóng" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
        </div>
      </div>
      {savedHref ? <div className="gqc-success">
        <p role="status">{mode === "NOTE" ? "Đã lưu vào sổ tay cá nhân." : "Đã thêm vào việc của tôi."}</p>
        <div className="gqc-success-actions">
          <Link href={savedHref} onClick={() => setOpen(false)}>{mode === "NOTE" ? "Mở sổ tay →" : "Mở việc của tôi →"}</Link>
          <button type="button" onClick={resetForm}>+ Ghi tiếp</button>
        </div>
      </div> : <form onSubmit={submit} className="gqc-form">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "NOTE" ? "Tiêu đề ghi chú..." : "Việc cần làm..."} maxLength={300} required />
        {mode === "NOTE"
          ? <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nội dung (không bắt buộc)..." rows={3} />
          : <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Hạn xử lý (không bắt buộc, mặc định 7 ngày)" />}
        {error ? <p role="alert" className="gqc-error">{error}</p> : null}
        <button type="submit" className="gqc-submit" disabled={busy || !title.trim()}>{busy ? "Đang lưu..." : mode === "NOTE" ? "Lưu vào sổ tay" : "+ Thêm việc"}</button>
      </form>}
    </div> : null}
    <button type="button" className="gqc-fab" aria-expanded={open} aria-label="Ghi nhanh: ghi chú hoặc việc cần làm" title="Ghi nhanh: ghi chú hoặc việc cần làm" onClick={() => setOpen((v) => !v)}>
      <Icon name={open ? "x" : "pencil"} size={22} />
    </button>
    <style>{`
      .global-quick-capture{position:fixed;right:20px;bottom:20px;z-index:65;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
      .global-quick-capture .gqc-fab{width:56px;height:56px;border-radius:50%;border:0;background:var(--brand,#0D6EFD);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(13,110,253,.35);cursor:pointer;transition:transform .15s}
      .global-quick-capture .gqc-fab:hover{transform:translateY(-2px)}
      .global-quick-capture .gqc-panel{width:min(340px,calc(100vw - 32px));background:#fff;border:1px solid #e5eaf2;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.18);overflow:hidden}
      .global-quick-capture .gqc-head{display:flex;align-items:center;justify-content:space-between;padding:10px 8px 0 14px}
      .global-quick-capture .gqc-tabs{display:flex;gap:4px}
      .global-quick-capture .gqc-tabs button{border:0;background:#f1f5f9;color:#475569;font-size:12px;font-weight:700;padding:7px 11px;border-radius:999px;cursor:pointer}
      .global-quick-capture .gqc-tabs button.active{background:var(--brand,#0D6EFD);color:#fff}
      .global-quick-capture .gqc-head-actions{display:flex;align-items:center;gap:2px}
      .global-quick-capture .gqc-open-full{color:#64748b;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center}
      .global-quick-capture .gqc-open-full:hover{background:#f1f5f9;color:#0f172a}
      .global-quick-capture .gqc-close{border:0;background:transparent;color:#94a3b8;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer}
      .global-quick-capture .gqc-close:hover{background:#f1f5f9}
      .global-quick-capture .gqc-form{display:grid;gap:8px;padding:12px 14px 14px}
      .global-quick-capture .gqc-form input,.global-quick-capture .gqc-form textarea{width:100%}
      .global-quick-capture .gqc-error{margin:0;font-size:11px;color:#b91c1c}
      .global-quick-capture .gqc-submit{border:0;background:var(--brand,#0D6EFD);color:#fff;font-weight:700;font-size:13px;padding:10px;border-radius:10px;cursor:pointer}
      .global-quick-capture .gqc-submit:disabled{opacity:.6;cursor:not-allowed}
      .global-quick-capture .gqc-success{padding:16px 14px;display:grid;gap:10px}
      .global-quick-capture .gqc-success p{margin:0;font-size:13px;color:#0f172a}
      .global-quick-capture .gqc-success-actions{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .global-quick-capture .gqc-success-actions a{color:var(--brand,#0D6EFD);font-weight:700;font-size:12px}
      .global-quick-capture .gqc-success-actions button{border:1px solid #e5eaf2;background:#fff;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}
      @media(max-width:640px){.global-quick-capture{right:14px;bottom:14px}.global-quick-capture .gqc-fab{width:52px;height:52px}}
    `}</style>
  </div>;
}
