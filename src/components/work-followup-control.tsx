"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { VnDateInput } from "@/components/vn-date-input";

type Initial = { id: string; waiting_for_label?: string | null; follow_up_at?: string | null; note?: string | null } | null;
type Props = { sourceType: "ACTION" | "EMR" | "RECORD" | "OTHER"; sourceId: string; initial?: Initial };

const hcmToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const dateOf = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso)) : "");
const vn = (d: string) => (d ? d.split("-").reverse().join("/") : "");

/**
 * "Chờ phản hồi": dùng khi mình đã làm phần của mình và đang CHỜ người khác (cá nhân, khoa/phòng, đơn vị ngoài) trả lời.
 * Việc được đánh dấu sẽ chuyển sang mục "Chờ phản hồi" (không bị coi là bỏ sót hay tính là quá hạn của mình); có ngày
 * "hỏi lại" để nhắc mình đòi phản hồi. Khi có phản hồi: bấm "Đã có phản hồi" để đưa việc về danh sách đang làm.
 */
export function WorkFollowupControl({ sourceType, sourceId, initial }: Props) {
  const [current, setCurrent] = useState<Initial>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [askAgain, setAskAgain] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openForm() {
    setWho(current?.waiting_for_label || "");
    setAskAgain(dateOf(current?.follow_up_at));
    setNote(current?.note || "");
    setError("");
    setOpen(true);
  }

  async function save() {
    if (who.trim().length < 2) { setError("Ghi rõ đang chờ ai hoặc chờ điều gì."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/work/followups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: sourceType, source_id: sourceId, waiting_for_type: "EXTERNAL_PARTY", waiting_for_label: who.trim(), follow_up_at: askAgain ? `${askAgain}T00:00:00+07:00` : null, note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || "Không lưu được.");
      setCurrent(body.followup); setOpen(false);
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được."); } finally { setBusy(false); }
  }

  async function clearWaiting() {
    if (!current?.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/work/followups?id=" + encodeURIComponent(current.id), { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || "Không bỏ trạng thái chờ được.");
      setCurrent(null);
      window.location.reload();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Không bỏ trạng thái chờ được."); } finally { setBusy(false); }
  }

  const askDate = dateOf(current?.follow_up_at);
  const askDue = !!askDate && askDate <= hcmToday();

  const dialog = open && typeof document !== "undefined" ? createPortal(
    <div role="presentation" onClick={() => !busy && setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label="Đánh dấu đang chờ phản hồi" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#0f172a", padding: 20, borderRadius: 14, width: "min(520px,100%)", display: "grid", gap: 12, boxShadow: "0 18px 60px rgba(0,0,0,.22)" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Đánh dấu đang chờ phản hồi</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>Dùng khi bạn đã làm phần của mình và đang <strong>chờ người khác trả lời</strong> (đồng nghiệp, khoa/phòng, đơn vị ngoài). Việc sẽ chuyển sang mục <strong>“Chờ phản hồi”</strong>. Khi có phản hồi, bấm “Đã có phản hồi” để đưa việc về danh sách đang làm.</p>
        <label style={{ display: "grid", gap: 4 }}>Đang chờ ai / chờ điều gì? *
          <input className="input" value={who} maxLength={300} onChange={(e) => setWho(e.target.value)} placeholder="VD: Phòng Hành chính cấp bản sao Quyết định" autoFocus />
        </label>
        <label style={{ display: "grid", gap: 4 }}>Hỏi lại vào ngày (không bắt buộc)
          <VnDateInput aria-label="Hỏi lại vào ngày" min={hcmToday()} value={askAgain} onChange={(e) => setAskAgain(e.target.value)} />
          <small className="muted">Đến ngày này, việc sẽ hiện nhãn “Cần hỏi lại” để bạn nhớ đòi phản hồi.</small>
        </label>
        <label style={{ display: "grid", gap: 4 }}>Ghi chú (không bắt buộc)
          <textarea className="input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? <small role="alert" style={{ color: "#b91c1c" }}>{error}</small> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="button tertiary" disabled={busy} onClick={() => setOpen(false)}>Hủy</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </section>
    </div>, document.body) : null;

  if (current) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge warning" title={current.note || undefined}>{"Đang chờ" + (current.waiting_for_label ? ": " + current.waiting_for_label : "")}{askDate ? " · hỏi lại " + vn(askDate) : ""}</span>
        {askDue ? <span className="badge danger">Cần hỏi lại</span> : null}
        <button className="button tertiary small" type="button" disabled={busy} onClick={openForm}>Sửa</button>
        <button className="button tertiary small" type="button" disabled={busy} onClick={() => void clearWaiting()} title="Đã nhận được phản hồi: đưa việc về danh sách đang làm">Đã có phản hồi</button>
        {dialog}
      </span>
    );
  }
  return (
    <>
      <button className="button tertiary small" type="button" disabled={busy} onClick={openForm} title="Bạn đã làm phần của mình và đang chờ người khác trả lời? Bấm để chuyển việc sang mục “Chờ phản hồi”.">Chờ phản hồi</button>
      {dialog}
    </>
  );
}
