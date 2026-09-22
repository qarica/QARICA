"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { prepareChecklistPhoto, type PreparedPhoto } from "@/lib/checklist-photo";
import { clearDraftPhotos, loadDraftPhotos, saveDraftPhotos } from "@/lib/monitoring-draft";

type FailRow = { responseId: string; itemContent: string; sectionTitle: string; reportedAt: string | null; dueAt: string | null };
type FormRow = { description: string; result: "PASS" | "FAIL" | "" };
type RecheckDraft = { forms: Record<string, FormRow> };

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

export function MonitoringRecheckClient({ roundId, status, canPerform, rows, area }: { roundId: string; status: string; canPerform: boolean; rows: FailRow[]; area?: string | null }) {
  const router = useRouter();
  const draftKey = `monitoring-recheck-draft:${roundId}`;
  const [forms, setForms] = useState<Record<string, FormRow>>({});
  const [photos, setPhotos] = useState<Record<string, PreparedPhoto[]>>({});
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [validation, setValidation] = useState<{ text: string; target?: string } | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [now, setNow] = useState(Date.now());

  const sharedReportedAt = rows[0]?.reportedAt || null;
  const sharedDueAt = rows[0]?.dueAt || null;
  const overdue = useMemo(() => sharedDueAt ? now > new Date(sharedDueAt).getTime() : false, [sharedDueAt, now]);
  const completedCount = rows.filter((row) => rowForm(row.responseId).description.trim() && rowForm(row.responseId).result).length;
  const hasMeaningfulDraft = Object.values(forms).some((row) => !!row.description.trim() || !!row.result) || Object.values(photos).some((list) => list.length > 0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as RecheckDraft;
          setForms(draft.forms || {});
          const restoredPhotos = await loadDraftPhotos(draftKey);
          if (!cancelled) setPhotos(restoredPhotos);
          if (!cancelled) {
            setDirty(true);
            setMessage({ tone: "success", text: "Đã khôi phục phần kiểm tra lại chưa lưu trên thiết bị này." });
          }
        }
      } catch {
        // Ignore malformed local draft.
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      try {
        if (!hasMeaningfulDraft) {
          window.localStorage.removeItem(draftKey);
          void clearDraftPhotos(draftKey);
          setDirty(false);
          return;
        }
        window.localStorage.setItem(draftKey, JSON.stringify({ forms } satisfies RecheckDraft));
        void saveDraftPhotos(draftKey, photos);
        setDirty(true);
      } catch {
        // Best effort only.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftReady, draftKey, hasMeaningfulDraft, forms, photos]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!canPerform || status !== "IN_PROGRESS" || !rows.length) return null;

  function rowForm(id: string): FormRow { return forms[id] || { description: "", result: "" }; }
  function update(id: string, patch: Partial<FormRow>) { setForms((current) => ({ ...current, [id]: { ...(current[id] || { description: "", result: "" }), ...patch } })); }

  function closeValidation() {
    const target = validation?.target;
    setValidation(null);
    if (!target) return;
    window.setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-recheck-target="${CSS.escape(target)}"]`));
      const el = candidates.find((x) => x.offsetParent !== null) || candidates[0];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus();
    }, 90);
  }

  async function addPhotos(row: FailRow, index: number, files: FileList | null, source: "camera" | "upload") {
    if (!files?.length) return;
    const current = photos[row.responseId] || [];
    if (current.length >= 3) return setMessage({ tone: "error", text: "Mỗi tiêu chí tối đa 03 ảnh sau khắc phục." });
    setPhotoBusy(row.responseId); setMessage(null);
    try {
      const next: PreparedPhoto[] = [];
      for (const file of Array.from(files).slice(0, 3 - current.length)) next.push(await prepareChecklistPhoto(file, { itemNo: index + 1, itemContent: row.itemContent, area: area || "", source }));
      setPhotos((x) => ({ ...x, [row.responseId]: [...(x[row.responseId] || []), ...next] }));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không xử lý được hình ảnh." });
    } finally {
      setPhotoBusy(null);
    }
  }

  function removePhoto(id: string, index: number) {
    setPhotos((x) => { const list = [...(x[id] || [])]; const removed = list.splice(index, 1)[0]; if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl); return { ...x, [id]: list }; });
  }

  async function clearDraft() {
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    await clearDraftPhotos(draftKey);
    setDirty(false);
  }

  async function submit() {
    setMessage(null);
    for (const row of rows) {
      const form = rowForm(row.responseId);
      if (!form.description.trim()) return setValidation({ text: `Vui lòng nhập biện pháp khắc phục cho “${row.itemContent}”.`, target: `desc-${row.responseId}` });
      if (!form.result) return setValidation({ text: `Vui lòng chọn kết quả kiểm tra lại cho “${row.itemContent}”.`, target: `result-${row.responseId}` });
    }
    setBusy(true);
    try {
      const formData = new FormData();
      const imageMeta: any[] = [];
      rows.forEach((row) => (photos[row.responseId] || []).forEach((photo, index) => {
        const key = `after_${row.responseId}_${index}`;
        formData.append(key, photo.file);
        imageMeta.push({ key, response_id: row.responseId, captured_at: photo.capturedAt, latitude: photo.geo.latitude, longitude: photo.geo.longitude, accuracy: photo.geo.accuracy, source: photo.source, stage: "AFTER" });
      }));
      formData.append("payload", JSON.stringify({ rows: rows.map((row) => ({ response_id: row.responseId, description: rowForm(row.responseId).description.trim(), result: rowForm(row.responseId).result })), images: imageMeta }));
      const res = await fetch(`/api/monitoring/rounds/${roundId}/recheck`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu kết quả kiểm tra lại.");
      await clearDraft();
      setMessage({
        tone: "success",
        text: data.status === "IN_PROGRESS"
          ? "Đã ghi nhận kiểm tra lại. Nội dung vẫn không đạt tiếp tục được giữ để khắc phục và kiểm tra lại."
          : "Đã ghi nhận kiểm tra lại. Tất cả nội dung không đạt đã đạt sau khắc phục; hồ sơ chuyển Phòng QLCL xác nhận.",
      });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  const validationModal = validation && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 18, display: "grid", placeItems: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) closeValidation(); }}>
      <div className="modal-card" role="alertdialog" aria-modal="true" style={{ width: "min(430px, calc(100vw - 36px))", borderRadius: 18 }}>
        <div style={{ padding: "20px 20px 12px" }}><div className="eyebrow" style={{ color: "#b45309" }}>CẦN BỔ SUNG</div><h3 style={{ margin: "5px 0 8px", fontSize: 21 }}>Chưa đủ thông tin</h3><p style={{ margin: 0, color: "#5e6d73", lineHeight: 1.55 }}>{validation.text}</p></div>
        <div style={{ padding: "12px 20px 20px", display: "flex", justifyContent: "flex-end" }}><button type="button" className="button primary" onClick={closeValidation}>Đã hiểu</button></div>
      </div>
    </div>, document.body,
  ) : null;

  return <>
    <style>{`
      .recheck-action-mobile{display:none}
      @media(max-width:760px){
        .recheck-panel>.panel-title{padding:14px!important;align-items:flex-start!important}
        .recheck-panel>.panel-title h2{font-size:20px!important}
        .recheck-panel .form-grid.two{grid-template-columns:1fr!important}
        .recheck-row{padding:13px!important;border-radius:14px!important}
        .recheck-row input,.recheck-row select{min-height:45px;font-size:15px}
        .recheck-desktop-action{display:none!important}
        .recheck-action-mobile{display:flex;position:sticky;bottom:8px;z-index:45;margin-top:2px;padding:9px;border:1px solid #d7e4e2;background:rgba(255,255,255,.96);box-shadow:0 10px 28px rgba(22,47,51,.12);border-radius:14px;align-items:center;gap:10px;backdrop-filter:blur(8px)}
        .recheck-action-mobile>div{min-width:88px}.recheck-action-mobile strong{display:block;font-size:14px}.recheck-action-mobile small{display:block;font-size:10px;color:#65747a}.recheck-action-mobile .button{flex:1;min-height:44px}
      }
    `}</style>
    {validationModal}
    <section className="panel recheck-panel">
      <div className="panel-title"><div><div className="eyebrow">BƯỚC 2 · KIỂM TRA LẠI</div><h2>{rows.length} tiêu chí Không đạt</h2><p>Chỉ kiểm tra lại các tiêu chí còn Không đạt. Nếu vẫn chưa đạt, hệ thống tiếp tục mở vòng khắc phục và kiểm tra lại với hạn +05 phút mới.</p></div><span className={`status-badge ${overdue ? "danger" : "warning"}`}>{overdue ? "Đã quá hạn 05 phút" : "Trong thời gian xử lý"}</span></div>
      <div style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
        {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
        <div className="scope-note"><div className="form-grid two"><div><div className="eyebrow">THỜI ĐIỂM BÁO · TỰ ĐỘNG</div><strong>{formatDateTime(sharedReportedAt)}</strong></div><div><div className="eyebrow">HẠN KIỂM TRA LẠI · +05 PHÚT</div><strong>{formatDateTime(sharedDueAt)}</strong> <span className={`status-badge ${overdue ? "danger" : "success"}`}>{overdue ? "Quá hạn" : "Đúng hạn"}</span></div></div><small className="muted">Thời điểm kiểm tra thực tế được hệ thống tự ghi khi bấm “Ghi nhận kiểm tra lại”.</small></div>
        {rows.map((row, index) => {
          const form = rowForm(row.responseId); const rowPhotos = photos[row.responseId] || [];
          return <section key={row.responseId} className="scope-note recheck-row" style={{ display: "grid", gap: 12 }}>
            <div><strong>{index + 1}. {row.sectionTitle} · {row.itemContent}</strong></div>
            <label><span>Biện pháp khắc phục *</span><input data-recheck-target={`desc-${row.responseId}`} value={form.description} onChange={(e) => update(row.responseId, { description: e.target.value })} placeholder="Mô tả biện pháp đã thực hiện" /></label>
            <label><span>Kết quả kiểm tra lại *</span><select data-recheck-target={`result-${row.responseId}`} value={form.result} onChange={(e) => update(row.responseId, { result: e.target.value as FormRow["result"] })}><option value="">— Chọn kết quả —</option><option value="PASS">Đạt sau khắc phục</option><option value="FAIL">Vẫn không đạt</option></select></label>
            <div><span style={{ display: "block", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Ảnh sau khắc phục</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <label className="button secondary small" style={{ cursor: "pointer" }}>📷 Chụp ảnh<input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { void addPhotos(row, index, e.target.files, "camera"); e.currentTarget.value = ""; }} /></label>
              <label className="button tertiary small" style={{ cursor: "pointer" }}>Tải ảnh<input hidden type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(row, index, e.target.files, "upload"); e.currentTarget.value = ""; }} /></label>
              {photoBusy === row.responseId ? <span className="muted tiny">Đang xử lý GPS/ảnh…</span> : null}
            </div>{rowPhotos.length ? <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>{rowPhotos.map((p, pi) => <div key={p.previewUrl} style={{ position: "relative" }}><img src={p.previewUrl} alt="Ảnh sau khắc phục" style={{ width: 86, height: 64, objectFit: "cover", borderRadius: 7, border: "1px solid #dfe6e9" }} /><button type="button" onClick={() => removePhoto(row.responseId, pi)} style={{ position: "absolute", top: -5, right: -5, border: 0, borderRadius: 20, width: 18, height: 18, padding: 0 }}>×</button></div>)}</div> : null}</div>
          </section>;
        })}
        <div className="recheck-desktop-action" style={{ display: "flex", justifyContent: "flex-end" }}><button className="button primary" disabled={busy || !!photoBusy} onClick={submit}><Icon name="badge-check" size={17} /> {busy ? "Đang lưu..." : "Ghi nhận kiểm tra lại"}</button></div>
        <div className="recheck-action-mobile"><div><strong>{completedCount}/{rows.length} hoàn tất</strong><small>{overdue ? "Đã quá hạn" : "Đang trong hạn"}</small></div><button className="button primary" disabled={busy || !!photoBusy} onClick={submit}><Icon name="badge-check" size={17} /> {busy ? "Đang lưu..." : "Ghi nhận kiểm tra lại"}</button></div>
      </div>
    </section>
  </>;
}
