"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Assignee = { user_id: string; full_name: string; job_title: string | null; department_name: string | null };

/**
 * Nút "Chuyển cho người khác" + hộp thoại: tìm người nhận (hoặc gõ tên nếu chưa có tài khoản), bắt buộc ghi lý do.
 * Có tài khoản: việc chuyển hẳn sang người nhận (họ được thông báo). Chưa có tài khoản: ghi nhận "đã giao cho <tên>".
 * Lịch sử ghi trong nhật ký và xem lại ở mục "Đã chuyển đi". Chỉ hiện cho việc đủ điều kiện (do máy chủ quyết định trong hàm DB).
 */
export function WorkReassignButton({ source, id, title }: { source: "REMINDER" | "ACTION"; id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState<Assignee[] | null>(null);
  const [to, setTo] = useState<Assignee | null>(null);
  // Người chưa có tài khoản: gõ tên tự do (việc vẫn ở người giao, được ghi nhận "đã giao cho <tên>").
  const [extName, setExtName] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/work/assignees?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(json.error || "Không tải được danh sách người nhận.");
        setList(json.assignees as Assignee[]);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : "Không tải được danh sách người nhận.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  function close() {
    if (busy) return;
    setOpen(false); setQ(""); setList(null); setTo(null); setExtName(null); setReason(""); setError(""); setDone("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!to && !extName) return setError("Chọn người nhận việc hoặc nhập tên người nhận.");
    if (reason.trim().length < 5) return setError("Ghi lý do chuyển việc (ít nhất 5 ký tự).");
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/work/reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(to ? { source, id, to_user_id: to.user_id, reason } : { source, id, to_name: extName, reason }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không chuyển được việc.");
      setDone(to ? `Đã chuyển cho ${to.full_name}. Họ đã nhận thông báo.` : `Đã ghi nhận giao cho ${extName}. Việc vẫn nằm trong danh sách của bạn để theo dõi.`);
      router.refresh();
      setTimeout(() => { setOpen(false); setQ(""); setList(null); setTo(null); setExtName(null); setReason(""); setDone(""); }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không chuyển được việc.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="button tertiary small" onClick={() => setOpen(true)} title="Chuyển việc này cho người khác thực hiện">Chuyển</button>
      {open ? (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal-card" role="dialog" aria-label="Chuyển việc cho người khác" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div><div className="eyebrow">VIỆC CỦA TÔI</div><h2>Chuyển cho người khác thực hiện</h2></div>
              <button type="button" className="icon-button" onClick={close} aria-label="Đóng">×</button>
            </div>
            <form className="modal-body" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
              <p className="muted" style={{ margin: 0 }}>Việc: <strong>{title}</strong>. Chuyển cho người có tài khoản: việc thuộc về họ, bạn xem lại ở mục “Đã chuyển đi”. Người chưa có tài khoản: gõ tên, việc vẫn ở danh sách của bạn và được ghi nhận “đã giao cho …”.</p>
              <label>Tìm người nhận (tên, email hoặc khoa/phòng)
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ để tìm…" autoComplete="off" aria-label="Tìm người nhận" />
              </label>
              <div role="listbox" aria-label="Người nhận" style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line, #d7e1e5)", borderRadius: 8 }}>
                {list === null ? <div className="muted" style={{ padding: 10 }}>Đang tải…</div> : null}
                {list && !list.length ? <div className="muted" style={{ padding: 10 }}>Không có người phù hợp trong hệ thống.</div> : null}
                {(list || []).map((p) => (
                  <button type="button" key={p.user_id} role="option" aria-selected={to?.user_id === p.user_id} onClick={() => { setTo(p); setExtName(null); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", padding: "8px 12px", border: 0, borderBottom: "1px solid var(--line, #e5ecef)", background: to?.user_id === p.user_id ? "#e8f0fe" : "transparent", textAlign: "left", cursor: "pointer" }}>
                    <strong>{p.full_name}</strong>
                    <small className="muted">{[p.job_title, p.department_name].filter(Boolean).join(" · ") || "—"}</small>
                  </button>
                ))}
                {q.trim().length >= 2 ? (
                  <button type="button" role="option" aria-selected={extName === q.trim()} onClick={() => { setTo(null); setExtName(q.trim()); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", padding: "8px 12px", border: 0, borderBottom: "1px solid var(--line, #e5ecef)", background: extName === q.trim() ? "#e8f0fe" : "transparent", textAlign: "left", cursor: "pointer" }}>
                    <strong>Giao cho “{q.trim()}” (chưa có tài khoản)</strong>
                    <small className="muted">Dùng tên vừa gõ làm người nhận</small>
                  </button>
                ) : null}
              </div>
              <label>Lý do chuyển *
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Tôi đi công tác tuần sau, nhờ anh/chị tiếp nhận" />
              </label>
              {error ? <div className="alert error" role="alert">{error}</div> : null}
              {done ? <div className="alert success" role="status">{done}</div> : null}
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="button secondary" onClick={close} disabled={busy}>Hủy</button>
                <button className="button primary" disabled={busy || (!to && !extName) || reason.trim().length < 5}>{busy ? "Đang chuyển…" : to ? `Chuyển cho ${to.full_name}` : extName ? `Giao cho ${extName}` : "Chuyển việc"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
