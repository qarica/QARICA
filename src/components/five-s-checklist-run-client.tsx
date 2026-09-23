/* eslint-disable @next/next/no-img-element -- Evidence previews use authenticated API/blob URLs; Next image optimization must not proxy them. */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { prepareChecklistPhoto, type PreparedPhoto } from "@/lib/checklist-photo";
import { clearDraftPhotos, loadDraftPhotos, saveDraftPhotos } from "@/lib/monitoring-draft";

type Item = { id: string; content: string; metadata?: any };
type Section = { id: string; title: string; items: Item[] };
type Result = "PASS" | "FAIL" | "NA" | "";
type ValidationPopup = { title: string; text: string; targetKey?: string | null };
type DraftState = {
  selectedAreas: string[];
  otherAreaEnabled: boolean;
  otherArea: string;
  staffName: string;
  monitoringDate: string;
  results: Record<string, Result>;
  notes: Record<string, string>;
};

const FALLBACK_AREAS = ["Sảnh đón khách và cửa ra về","Khu vực bãi đỗ xe","Khu vực sân xung quanh bệnh viện","Khu vực đường bao quanh khuôn viên BV","Khu vực cầu thang bộ lối lên khu Văn Phòng","Bảng hiệu của bệnh viện","Khu vực phía trước các ki-ốt","Khu vực tập kết rác thải y tế và rác thải thông thường"];
const radioStyle = { width: 18, height: 18, minWidth: 18, padding: 0, margin: 0, cursor: "pointer", accentColor: "#0b8f87" } as const;

const FIVE_S_FAMILY_CODES = new Set([
  "BK01.V1_QLCL.QĐ.06",
  "BK02.V1_QLCL.QĐ.06",
  "BK03.V1_QLCL.QĐ.06",
  "BK05.V1_QLCL.QĐ.06",
  "BK07.V1_QLCL.QĐ.06",
  "BK09.V1_QLCL.QĐ.06",
]);

export function FiveSChecklistRunClient({ templateId, versionId, templateCode, sections, assessorName, canPerform, roundId = null, initialMonitoringDate = null }: {
  templateId: string;
  versionId: string;
  templateCode: string | null;
  sections: Section[];
  assessorName: string | null;
  canPerform: boolean;
  roundId?: string | null;
  initialMonitoringDate?: string | null;
}) {
  const router = useRouter();
  const draftKey = `monitoring-draft:${roundId || versionId}`;
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [otherAreaEnabled, setOtherAreaEnabled] = useState(false);
  const [otherArea, setOtherArea] = useState("");
  const [staffName, setStaffName] = useState("");
  const [monitoringDate, setMonitoringDate] = useState(initialMonitoringDate || "");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, PreparedPhoto[]>>({});
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [validationPopup, setValidationPopup] = useState<ValidationPopup | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);

  const items = useMemo(() => sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionTitle: section.title }))), [sections]);
  const metadataAreas = items.find((item) => Array.isArray(item.metadata?.area_options))?.metadata?.area_options as string[] | undefined;
  const areas = (metadataAreas?.length ? metadataAreas : FALLBACK_AREAS).filter((area) => !area.toLocaleLowerCase("vi-VN").includes("trung tâm đào tạo")).filter((area) => area.trim().toLocaleLowerCase("vi-VN") !== "khác");

  const assessed = items.filter((item) => !!results[item.id]);
  const passCount = items.filter((item) => results[item.id] === "PASS").length;
  const failCount = items.filter((item) => results[item.id] === "FAIL").length;
  const naCount = items.filter((item) => results[item.id] === "NA").length;
  const denominator = passCount + failCount;
  const compliance = denominator ? Math.round((passCount / denominator) * 1000) / 10 : 0;
  const progress = items.length ? Math.round((assessed.length / items.length) * 100) : 0;
  const areaText = [...selectedAreas, ...(otherAreaEnabled && otherArea.trim() ? otherArea.split(";").map((x) => x.trim()).filter(Boolean) : [])].join("; ");

  const hasMeaningfulDraft = selectedAreas.length > 0 || otherAreaEnabled || !!otherArea.trim() || !!staffName.trim() || Object.keys(results).length > 0 || Object.values(notes).some((x) => !!x.trim()) || Object.values(photos).some((list) => list.length > 0);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as DraftState;
          setSelectedAreas(Array.isArray(draft.selectedAreas) ? draft.selectedAreas : []);
          setOtherAreaEnabled(!!draft.otherAreaEnabled);
          setOtherArea(draft.otherArea || "");
          setStaffName(draft.staffName || "");
          setMonitoringDate(draft.monitoringDate || initialMonitoringDate || "");
          setResults(draft.results || {});
          setNotes(draft.notes || {});
          const restoredPhotos = await loadDraftPhotos(draftKey);
          if (!cancelled) setPhotos(restoredPhotos);
          if (!cancelled) {
            setDirty(true);
            setMessage({ tone: "success", text: "Đã khôi phục bản nháp chưa lưu trên thiết bị này." });
          }
        }
      } catch {
        // Ignore malformed local drafts and continue with a clean checklist.
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [draftKey, initialMonitoringDate]);

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
        const draft: DraftState = { selectedAreas, otherAreaEnabled, otherArea, staffName, monitoringDate, results, notes };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
        void saveDraftPhotos(draftKey, photos);
        setDirty(true);
      } catch {
        // The official save flow still works even if browser draft storage is unavailable.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftReady, draftKey, hasMeaningfulDraft, selectedAreas, otherAreaEnabled, otherArea, staffName, monitoringDate, results, notes, photos]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!templateCode || !FIVE_S_FAMILY_CODES.has(templateCode) || !canPerform) return null;

  function toggleArea(area: string) {
    setSelectedAreas((current) => current.includes(area) ? current.filter((value) => value !== area) : [...current, area]);
  }

  function openValidation(text: string, targetKey?: string) {
    setValidationPopup({ title: "Chưa đủ thông tin", text, targetKey: targetKey || null });
  }

  function closeValidation() {
    const targetKey = validationPopup?.targetKey;
    setValidationPopup(null);
    if (!targetKey) return;
    window.setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-validation-target="${CSS.escape(targetKey)}"]`));
      const target = candidates.find((el) => el.offsetParent !== null) || candidates[0];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) target.focus();
    }, 90);
  }

  async function addPhotos(itemId: string, itemIndex: number, itemContent: string, files: FileList | null, source: "camera" | "upload") {
    if (!files?.length) return;
    const current = photos[itemId] || [];
    if (current.length >= 3) return setMessage({ tone: "error", text: "Mỗi tiêu chí tối đa 03 ảnh." });
    setPhotoBusy(itemId); setMessage(null);
    try {
      const next: PreparedPhoto[] = [];
      for (const file of Array.from(files).slice(0, 3 - current.length)) next.push(await prepareChecklistPhoto(file, { itemNo: itemIndex + 1, itemContent, area: areaText, source }));
      setPhotos((x) => ({ ...x, [itemId]: [...(x[itemId] || []), ...next] }));
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không xử lý được hình ảnh." });
    } finally {
      setPhotoBusy(null);
    }
  }

  function removePhoto(itemId: string, index: number) {
    setPhotos((x) => {
      const list = [...(x[itemId] || [])];
      const removed = list.splice(index, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return { ...x, [itemId]: list };
    });
  }

  function setResult(itemId: string, result: Result) {
    setResults((current) => ({ ...current, [itemId]: result }));
  }

  function photoControls(item: Item & { sectionTitle: string }, index: number, compact = false) {
    const itemPhotos = photos[item.id] || [];
    return <div className={compact ? "five-s-mobile-media" : undefined}>
      <div className="five-s-photo-actions">
        <label className={compact ? "button secondary small" : "icon-button header-icon"} title="Chụp ảnh" aria-label="Chụp ảnh" style={{ cursor: "pointer" }}>
          <Icon name="camera" size={17} />{compact ? <span>Chụp ảnh</span> : null}
          <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { void addPhotos(item.id, index, item.content, e.target.files, "camera"); e.currentTarget.value = ""; }} />
        </label>
        <label className={compact ? "button tertiary small" : "icon-button header-icon"} title="Tải ảnh" aria-label="Tải ảnh" style={{ cursor: "pointer" }}>
          <Icon name="paperclip" size={17} />{compact ? <span>Tải ảnh</span> : null}
          <input hidden type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(item.id, index, item.content, e.target.files, "upload"); e.currentTarget.value = ""; }} />
        </label>
        {photoBusy === item.id ? <span className="muted tiny">Đang xử lý GPS/ảnh…</span> : null}
      </div>
      {itemPhotos.length ? <div className="five-s-photo-list">{itemPhotos.map((p, pi) => <div key={p.previewUrl} className="five-s-photo-thumb"><img src={p.previewUrl} alt="Ảnh minh chứng" /><button type="button" onClick={() => removePhoto(item.id, pi)}>×</button></div>)}</div> : null}
      {results[item.id] === "FAIL" && itemPhotos.length === 0 ? <small className="five-s-photo-recommendation">Khuyến nghị chụp ảnh hiện trạng trước khắc phục.</small> : null}
    </div>;
  }

  async function clearDraft() {
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    await clearDraftPhotos(draftKey);
    setDirty(false);
  }

  async function saveChecklist() {
    setMessage(null);
    if (otherAreaEnabled && !otherArea.trim()) return openValidation("Bạn đã chọn Khác. Vui lòng nhập vị trí cụ thể.", "other-area");
    if (!areaText) return openValidation("Vui lòng chọn ít nhất một khu vực đánh giá hoặc nhập vị trí ở mục Khác.", "areas");
    if (!staffName.trim()) return openValidation("Vui lòng nhập Nhân viên thực hiện 5S trước khi lưu bảng kiểm.", "staff-name");
    if (!monitoringDate) return openValidation("Vui lòng chọn Ngày giám sát trước khi lưu bảng kiểm.", "monitoring-date");
    if (assessed.length !== items.length) {
      const firstMissing = items.find((item) => !results[item.id]);
      return openValidation(`Còn ${items.length - assessed.length} tiêu chí chưa được đánh giá. Vui lòng chấm đủ ${items.length}/${items.length} nội dung trước khi lưu.`, firstMissing ? `item-${firstMissing.id}` : undefined);
    }

    setBusy(true);
    try {
      const formData = new FormData();
      const imageMeta: any[] = [];
      for (const item of items) {
        (photos[item.id] || []).forEach((photo, index) => {
          const key = `img_${item.id}_${index}`;
          formData.append(key, photo.file);
          imageMeta.push({ key, item_id: item.id, captured_at: photo.capturedAt, latitude: photo.geo.latitude, longitude: photo.geo.longitude, accuracy: photo.geo.accuracy, source: photo.source, stage: "INITIAL" });
        });
      }
      formData.append("payload", JSON.stringify({
        monitoring_date: monitoringDate,
        staff_name: staffName.trim(),
        selected_areas: selectedAreas,
        other_area: otherAreaEnabled ? otherArea.trim() : "",
        images: imageMeta,
        responses: items.map((item) => ({ item_id: item.id, result: results[item.id], note: notes[item.id]?.trim() || null })),
        ...(roundId ? {} : { template_id: templateId, version_id: versionId }),
      }));
      const endpoint = roundId ? `/api/monitoring/rounds/${roundId}/5s-results` : "/api/monitoring/rounds/5s";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu bảng kiểm 5S.");
      await clearDraft();
      setMessage({ tone: "success", text: data.fail_count > 0 ? `Đã lưu ${data.record_code}. Có ${data.fail_count} nội dung Không đạt; hạn kiểm tra lại được tự động tính +05 phút.` : `Đã lưu ${data.record_code}. Không có nội dung Không đạt; hồ sơ chuyển Phòng QLCL xác nhận.` });
      setTimeout(() => router.push(`/monitoring/${data.round_id}`), 550);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Có lỗi xảy ra." });
    } finally {
      setBusy(false);
    }
  }

  const validationModal = validationPopup && typeof document !== "undefined" ? createPortal(
    <div className="modal-backdrop" style={{ padding: 18, display: "grid", placeItems: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) closeValidation(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="validation-title" className="modal-card" style={{ width: "min(430px, calc(100vw - 36px))", borderRadius: 18 }}>
        <div style={{ padding: "20px 20px 12px" }}>
          <div className="eyebrow" style={{ color: "#b45309" }}>CẦN BỔ SUNG</div>
          <h3 id="validation-title" style={{ margin: "5px 0 8px", fontSize: 21 }}>{validationPopup.title}</h3>
          <p style={{ margin: 0, color: "#5e6d73", lineHeight: 1.55 }}>{validationPopup.text}</p>
        </div>
        <div style={{ padding: "12px 20px 20px", display: "flex", justifyContent: "flex-end" }}><button type="button" className="button primary" autoFocus onClick={closeValidation}>Đã hiểu</button></div>
      </div>
    </div>, document.body,
  ) : null;

  return <>
    <style>{`
      .five-s-mobile{display:none}
      .five-s-photo-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .five-s-photo-actions .icon-button{width:36px;height:36px;flex:0 0 auto}
      .five-s-photo-list{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
      .five-s-photo-thumb{position:relative}
      .five-s-photo-thumb img{width:76px;height:58px;object-fit:cover;border-radius:7px;border:1px solid #dfe6e9}
      .five-s-photo-thumb button{position:absolute;top:-5px;right:-5px;border:0;border-radius:20px;width:18px;height:18px;padding:0}
      .five-s-photo-recommendation{color:#a56608;display:block;margin-top:5px}
      .five-s-mobile-action{display:none}
      @media(max-width:760px){
        .five-s-run-panel{overflow:visible!important;border-radius:17px!important}
        .five-s-run-panel>.panel-title{padding:14px 14px 10px!important;align-items:flex-start!important}
        .five-s-run-panel>.panel-title h2{font-size:20px!important;line-height:1.28}
        .five-s-run-panel>.panel-title p{font-size:13px!important;line-height:1.45}
        .five-s-run-panel .check-grid{grid-template-columns:1fr!important}
        .five-s-run-panel .check-card{min-height:54px;padding:10px 12px!important}
        .five-s-run-panel .form-grid.two{grid-template-columns:1fr!important}
        .five-s-desktop{display:none!important}
        .five-s-mobile{display:grid;gap:10px;padding:0 12px 12px}
        .five-s-mobile-card{border:1px solid #dce7e6;background:#fff;border-radius:14px;padding:13px;display:grid;gap:11px;scroll-margin-top:120px}
        .five-s-mobile-card.fail{border-color:#f2c7c7;background:#fffafa}
        .five-s-mobile-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
        .five-s-mobile-card-head strong{font-size:13px;color:#1d3f73}
        .five-s-mobile-card-content{font-size:16px;line-height:1.42;font-weight:650;color:#263238}
        .five-s-result-segments{display:grid;grid-template-columns:1fr 1.2fr .72fr;gap:7px}
        .five-s-result-segments button{min-height:43px;border:1px solid #d9e2e4;background:#fff;border-radius:10px;font-size:13px;font-weight:750;color:#536269;padding:8px 6px}
        .five-s-result-segments button.active-pass{border-color:#92ccb1;background:#edf8f1;color:#18734d}
        .five-s-result-segments button.active-fail{border-color:#efb1b1;background:#fff0f0;color:#b43838}
        .five-s-result-segments button.active-na{border-color:#cbd5d8;background:#f3f6f7;color:#47545a}
        .five-s-mobile-card input[type=text]{min-height:44px;font-size:15px!important}
        .five-s-mobile-media .five-s-photo-actions label{min-height:39px;display:inline-flex;align-items:center;gap:6px}
        .five-s-mobile .five-s-photo-thumb img{width:88px;height:68px}
        .five-s-mobile-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:0 12px 12px}
        .five-s-mobile-summary>div{border:1px solid #dce5e7;border-radius:12px;padding:9px;background:#fff}
        .five-s-mobile-summary span{display:block;font-size:10px;color:#6b7a80;font-weight:700}
        .five-s-mobile-summary strong{display:block;font-size:20px;margin-top:2px}
        .five-s-mobile-action{display:flex;position:sticky;bottom:8px;z-index:45;margin:0 10px 10px;padding:9px;border:1px solid #d7e4e2;background:rgba(255,255,255,.96);box-shadow:0 10px 28px rgba(22,47,51,.12);border-radius:14px;align-items:center;gap:10px;backdrop-filter:blur(8px)}
        .five-s-mobile-action .five-s-mobile-progress{min-width:92px}
        .five-s-mobile-action .five-s-mobile-progress strong{display:block;font-size:15px}
        .five-s-mobile-action .five-s-mobile-progress small{display:block;font-size:10px;color:#65747a;margin-top:2px}
        .five-s-mobile-action .button{flex:1;min-height:44px}
        .five-s-desktop-summary{display:none!important}
      }
    `}</style>
    {validationModal}
    <section className="panel five-s-run-panel">
      <div className="panel-title"><div><div className="eyebrow">BẢNG KIỂM ĐANG THỰC HIỆN · {templateCode}</div><h2>Giám sát 5S - Khu vực: Bên ngoài bệnh viện</h2><p>Chấm, ghi chú và chụp/tải ảnh cho từng tiêu chí. Bản nháp được tự lưu trên thiết bị trong khi chưa lưu chính thức.</p></div><div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span className="status-badge info">Đang kiểm</span>{dirty ? <span className="status-badge success" role="status" aria-live="polite">Đã tự lưu nháp</span> : null}</div></div>
      <div style={{ padding: "0 18px 18px", display: "grid", gap: 18 }}>
        {message ? <div className={`alert ${message.tone}`}>{message.text}</div> : null}
        <div data-validation-target="areas"><strong>Khu vực đánh giá</strong><div className="check-grid" style={{ marginTop: 10 }}>
          {areas.map((area) => <label className="check-card" key={area}><input type="checkbox" checked={selectedAreas.includes(area)} onChange={() => toggleArea(area)} /><span><strong>{area}</strong></span></label>)}
          <label className="check-card"><input type="checkbox" checked={otherAreaEnabled} onChange={(e) => { setOtherAreaEnabled(e.target.checked); if (!e.target.checked) setOtherArea(""); }} /><span><strong>Khác</strong></span></label>
        </div>{otherAreaEnabled ? <label style={{ display: "block", marginTop: 10 }}><span>Vị trí khác</span><input data-validation-target="other-area" value={otherArea} onChange={(e) => setOtherArea(e.target.value)} placeholder="Nhập vị trí khác; phân cách nhiều vị trí bằng dấu ;" /></label> : null}</div>
        <div className="form-grid two"><label><span>Nhân viên thực hiện 5S *</span><input data-validation-target="staff-name" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Họ tên nhân viên thực hiện" /></label><label><span>Ngày giám sát *</span><input data-validation-target="monitoring-date" type="date" value={monitoringDate} onChange={(e) => setMonitoringDate(e.target.value)} /></label></div>
        <div className="scope-note"><strong>Người giám sát:</strong> {assessorName || "Tài khoản đang đăng nhập"}. Nếu có Không đạt, thời điểm báo được ghi tự động lúc lưu và hạn kiểm tra lại = +05 phút.</div>
      </div>

      <div className="five-s-desktop table-wrap"><table style={{ fontSize: 13.5 }}><thead><tr><th style={{ width: 54 }}>#</th><th style={{ minWidth: 120 }}>Tiêu chuẩn</th><th style={{ minWidth: 300 }}>Nội dung</th><th style={{ width: 72, textAlign: "center" }}>Đạt</th><th style={{ width: 90, textAlign: "center" }}>Không đạt</th><th style={{ width: 64, textAlign: "center" }}>/</th><th style={{ minWidth: 300 }}>Ghi chú / Hình ảnh</th></tr></thead><tbody>
        {items.map((item, index) => {
          const value = results[item.id] || "";
          return <tr data-validation-target={`item-${item.id}`} key={item.id}><td>{index + 1}</td><td><strong>{item.sectionTitle}</strong></td><td style={{ lineHeight: 1.5 }}>{item.content.split("\n").map((line, i) => <div key={i}>{line}</div>)}</td>
            <td style={{ textAlign: "center" }}><input style={radioStyle} type="radio" name={`desktop-result-${item.id}`} checked={value === "PASS"} onChange={() => setResult(item.id, "PASS")} /></td>
            <td style={{ textAlign: "center" }}><input style={radioStyle} type="radio" name={`desktop-result-${item.id}`} checked={value === "FAIL"} onChange={() => setResult(item.id, "FAIL")} /></td>
            <td style={{ textAlign: "center" }}><input style={radioStyle} type="radio" name={`desktop-result-${item.id}`} checked={value === "NA"} onChange={() => setResult(item.id, "NA")} /></td>
            <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><input style={{ fontSize: 13, flex: 1, minWidth: 0 }} value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Ghi chú" />{photoControls(item, index)}</div></td>
          </tr>;
        })}
      </tbody></table></div>

      <div className="five-s-mobile">
        {items.map((item, index) => {
          const value = results[item.id] || "";
          return <article key={item.id} data-validation-target={`item-${item.id}`} className={`five-s-mobile-card ${value === "FAIL" ? "fail" : ""}`}>
            <div className="five-s-mobile-card-head"><strong>#{index + 1} · {item.sectionTitle}</strong>{value === "FAIL" ? <span className="status-badge danger">Sẽ kiểm lại</span> : null}</div>
            <div className="five-s-mobile-card-content">{item.content.split("\n").map((line, i) => <div key={i}>{line}</div>)}</div>
            <div className="five-s-result-segments">
              <button type="button" className={value === "PASS" ? "active-pass" : ""} onClick={() => setResult(item.id, "PASS")}>Đạt</button>
              <button type="button" className={value === "FAIL" ? "active-fail" : ""} onClick={() => setResult(item.id, "FAIL")}>Không đạt</button>
              <button type="button" className={value === "NA" ? "active-na" : ""} onClick={() => setResult(item.id, "NA")}>/</button>
            </div>
            <input type="text" value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Ghi chú" />
            {photoControls(item, index, true)}
          </article>;
        })}
      </div>

      <div className="five-s-mobile-summary">
        <div><span>Đã đánh giá</span><strong>{assessed.length}/{items.length}</strong></div>
        <div><span>Không đạt</span><strong style={{ color: failCount ? "#b45309" : undefined }}>{failCount}</strong></div>
        <div><span>Tỷ lệ đạt</span><strong>{compliance}%</strong></div>
      </div>

      <div className="five-s-desktop-summary" style={{ padding: 18, display: "grid", gap: 18 }}>
        <section className="kpi-grid"><article className="kpi-card"><span>Đã đánh giá</span><strong>{assessed.length}/{items.length}</strong><small>Tiến độ {progress}%</small></article><article className="kpi-card success"><span>Đạt</span><strong>{passCount}</strong><small>Tính vào tỷ lệ</small></article><article className="kpi-card warning"><span>Không đạt</span><strong>{failCount}</strong><small>Sẽ mở 01 lần kiểm tra lại chung</small></article><article className="kpi-card"><span>Tỷ lệ đạt</span><strong>{compliance}%</strong><small>Loại trừ “/” ({naCount})</small></article></section>
        <div className="scope-note"><strong>Quy trình:</strong> Chấm đủ {items.length}/{items.length} → Lưu kết quả ban đầu (khóa kết quả gốc) → nếu có Không đạt, kiểm tra lại 01 lần chung chỉ với các tiêu chí Không đạt → gửi Phòng QLCL xác nhận.</div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="button primary" disabled={busy || !!photoBusy} onClick={saveChecklist}><Icon name="save" size={17} /> {busy ? "Đang lưu..." : "Lưu kết quả ban đầu"}</button></div>
      </div>

      <div className="five-s-mobile-action">
        <div className="five-s-mobile-progress"><strong>{assessed.length}/{items.length} đã chấm</strong><small>{failCount} Không đạt · {progress}%</small></div>
        <button className="button primary" disabled={busy || !!photoBusy} onClick={saveChecklist}><Icon name="save" size={17} /> {busy ? "Đang lưu..." : "Lưu kết quả ban đầu"}</button>
      </div>
    </section>
  </>;
}
