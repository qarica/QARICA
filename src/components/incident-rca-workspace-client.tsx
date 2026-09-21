"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TimelineRow = {
  event_time: string;
  event_title: string;
  event_description: string;
  source_reference: string;
};

type WhyRow = {
  why_level: number;
  answer: string;
  evidence_note: string;
};

type RootRow = {
  category_code: string;
  cause_statement: string;
  evidence_basis: string;
  action_required: boolean;
};

const CATEGORIES = [
  { code: "PATIENT", label: "Người bệnh" },
  { code: "STAFF", label: "Nhân viên" },
  { code: "TASK_TECHNOLOGY", label: "Công việc / công nghệ" },
  { code: "TEAM", label: "Nhóm làm việc" },
  { code: "WORK_ENVIRONMENT", label: "Môi trường làm việc" },
  { code: "INFORMATION_SYSTEMS", label: "Hệ thống thông tin" },
  { code: "ORGANIZATION_MANAGEMENT", label: "Tổ chức / quản lý" },
  { code: "INSTITUTIONAL_CONTEXT", label: "Bối cảnh thể chế" },
] as const;

function emptyTimeline(): TimelineRow {
  return { event_time: "", event_title: "", event_description: "", source_reference: "" };
}

function emptyRoot(): RootRow {
  return { category_code: "", cause_statement: "", evidence_basis: "", action_required: true };
}

function blankWhys(): WhyRow[] {
  return [1, 2, 3, 4, 5].map((level) => ({ why_level: level, answer: "", evidence_note: "" }));
}

function localInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function IncidentRcaWorkspaceClient({ recordId, onReadyChange }: { recordId: string; onReadyChange?: (ready: boolean) => void }) {
  const router = useRouter();
  const [timeline, setTimeline] = useState<TimelineRow[]>([emptyTimeline()]);
  const [whys, setWhys] = useState<WhyRow[]>(blankWhys());
  const [fishbone, setFishbone] = useState<Record<string, string>>({});
  const [roots, setRoots] = useState<RootRow[]>([emptyRoot()]);
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState("NOT_STARTED");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const counts = useMemo(() => {
    const timelineCount = timeline.filter((row) => row.event_title.trim()).length;
    const whyCount = whys.filter((row) => row.answer.trim()).length;
    const fishboneCount = Object.values(fishbone).reduce((sum, value) => sum + value.split("\n").filter((line) => line.trim()).length, 0);
    const rootCount = roots.filter((row) => row.cause_statement.trim()).length;
    return { timeline: timelineCount, whys: whyCount, fishbone: fishboneCount, roots: rootCount };
  }, [timeline, whys, fishbone, roots]);

  const ready = counts.timeline >= 1 && counts.fishbone >= 1 && counts.roots >= 1 && (counts.whys === 0 || counts.whys >= 3);

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/incidents/${recordId}/rca`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không tải được RCA.");

      setEditable(!!json.editable);
      setStatus(String(json.status || "NOT_STARTED"));

      const loadedTimeline = Array.isArray(json.timeline) ? json.timeline.map((row: any) => ({
        event_time: localInput(row.event_time),
        event_title: String(row.event_title || ""),
        event_description: String(row.event_description || ""),
        source_reference: String(row.source_reference || ""),
      })) : [];
      setTimeline(loadedTimeline.length ? loadedTimeline : [emptyTimeline()]);

      const byLevel = new Map<number, any>((Array.isArray(json.five_whys) ? json.five_whys : []).map((row: any) => [Number(row.why_level), row]));
      setWhys([1, 2, 3, 4, 5].map((level) => ({
        why_level: level,
        answer: String(byLevel.get(level)?.answer || ""),
        evidence_note: String(byLevel.get(level)?.evidence_note || ""),
      })));

      const fish: Record<string, string[]> = {};
      for (const row of Array.isArray(json.fishbone) ? json.fishbone : []) {
        const code = String(row.category_code || "");
        if (!fish[code]) fish[code] = [];
        if (row.factor_text) fish[code].push(String(row.factor_text));
      }
      setFishbone(Object.fromEntries(Object.entries(fish).map(([key, values]) => [key, values.join("\n")])));

      const loadedRoots = Array.isArray(json.root_causes) ? json.root_causes.map((row: any) => ({
        category_code: String(row.category_code || ""),
        cause_statement: String(row.cause_statement || ""),
        evidence_basis: String(row.evidence_basis || ""),
        action_required: row.action_required !== false,
      })) : [];
      setRoots(loadedRoots.length ? loadedRoots : [emptyRoot()]);
      onReadyChange?.(!!json.ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được RCA.");
      onReadyChange?.(false);
    } finally {
      setLoading(false);
    }
  }, [recordId, onReadyChange]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const fishboneRows = CATEGORIES.flatMap((category) =>
        String(fishbone[category.code] || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((factor_text) => ({ category_code: category.code, factor_text }))
      );

      const payload = {
        timeline: timeline
          .filter((row) => row.event_title.trim())
          .map((row) => ({
            event_time: row.event_time ? new Date(row.event_time).toISOString() : null,
            event_title: row.event_title,
            event_description: row.event_description,
            source_reference: row.source_reference,
          })),
        five_whys: whys.filter((row) => row.answer.trim()),
        fishbone: fishboneRows,
        root_causes: roots.filter((row) => row.cause_statement.trim()),
      };

      const response = await fetch(`/api/incidents/${recordId}/rca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Không lưu được RCA.");
      setNotice(json.message || "Đã lưu RCA có cấu trúc.");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được RCA.");
    } finally {
      setSaving(false);
    }
  }

  function patchTimeline(index: number, patch: Partial<TimelineRow>) {
    setTimeline((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function patchWhy(level: number, patch: Partial<WhyRow>) {
    setWhys((current) => current.map((row) => row.why_level === level ? { ...row, ...patch } : row));
  }

  function patchRoot(index: number, patch: Partial<RootRow>) {
    setRoots((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  return (
    <div className="in-box incident-rca">
      <style>{`
        .incident-rca .rca-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
        .incident-rca .rca-head h3{margin:0 0 5px}.incident-rca .rca-head p{margin:0;max-width:760px}
        .incident-rca .rca-status{border-radius:999px;padding:6px 9px;background:${ready ? "#e8f7ee" : "#fff7e6"};color:${ready ? "#166534" : "#92400e"};font-size:10px;font-weight:850;white-space:nowrap}
        .incident-rca .rca-gates{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:10px 0 14px}
        .incident-rca .rca-gate{border:1px solid #dfe8ea;border-radius:10px;padding:9px;background:#fff}.incident-rca .rca-gate strong{display:block;font-size:14px}.incident-rca .rca-gate span{display:block;font-size:9px;color:#64748b;margin-top:2px}
        .incident-rca .rca-section{border-top:1px solid #edf2f3;padding-top:14px;margin-top:14px}.incident-rca .rca-section h4{margin:0 0 4px;font-size:13px}.incident-rca .rca-section>p{margin:0 0 10px;font-size:10px;color:#64748b}
        .incident-rca .timeline-card,.incident-rca .root-card{border:1px solid #dfe8ea;border-radius:11px;padding:10px;margin-bottom:8px;background:#fbfdfd}
        .incident-rca .timeline-grid{display:grid;grid-template-columns:190px 1fr;gap:8px}.incident-rca .timeline-grid .wide{grid-column:1/-1}
        .incident-rca label{display:grid;gap:4px;font-size:10px;font-weight:750;color:#44545a}.incident-rca input,.incident-rca textarea,.incident-rca select{width:100%}
        .incident-rca .why-grid{display:grid;gap:8px}.incident-rca .why-card{display:grid;grid-template-columns:72px 1fr 1fr;gap:8px;align-items:start;border:1px solid #dfe8ea;border-radius:10px;padding:9px}.incident-rca .why-level{font-size:11px;font-weight:900;color:#1d4ed8;padding-top:8px}
        .incident-rca .fishbone-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.incident-rca .fishbone-card{border:1px solid #dfe8ea;border-radius:10px;padding:9px;background:#fff}.incident-rca .fishbone-card strong{display:block;font-size:10px;margin-bottom:5px}.incident-rca .fishbone-card small{display:block;color:#718087;font-size:9px;margin-top:4px}
        .incident-rca .root-grid{display:grid;grid-template-columns:220px 1fr;gap:8px}.incident-rca .root-grid .wide{grid-column:1/-1}.incident-rca .root-check{display:flex;align-items:center;gap:6px!important}.incident-rca .root-check input{width:auto}
        .incident-rca .row-actions,.incident-rca .rca-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px}.incident-rca .rca-actions{justify-content:space-between;border-top:1px solid #edf2f3;padding-top:12px;margin-top:14px}.incident-rca .rca-help{font-size:9px;color:#718087}
        @media(max-width:800px){.incident-rca .rca-gates,.incident-rca .fishbone-grid{grid-template-columns:1fr 1fr}.incident-rca .timeline-grid,.incident-rca .why-card,.incident-rca .root-grid{grid-template-columns:1fr}.incident-rca .timeline-grid .wide,.incident-rca .root-grid .wide{grid-column:auto}.incident-rca .rca-head,.incident-rca .rca-actions{display:grid}}
      `}</style>

      <div className="rca-head">
        <div>
          <h3>RCA có cấu trúc · Timeline → Five Why → Fishbone → Root Cause</h3>
          <p>Phân tích theo chuỗi nguyên nhân hệ thống. Không dùng RCA để tìm cá nhân chịu lỗi; nguyên nhân gốc phải dẫn được đến Action/CAPA có thể kiểm soát.</p>
        </div>
        <span className="rca-status">{ready ? "Đủ gate RCA" : status === "COMPLETED" ? "RCA đã hoàn tất" : "RCA chưa đủ gate"}</span>
      </div>

      <div className="rca-gates">
        <div className="rca-gate"><strong>{counts.timeline}</strong><span>Timeline · tối thiểu 1</span></div>
        <div className="rca-gate"><strong>{counts.whys}/5</strong><span>Five Why · tối thiểu 3 cấp</span></div>
        <div className="rca-gate"><strong>{counts.fishbone}</strong><span>Yếu tố Fishbone · tối thiểu 1</span></div>
        <div className="rca-gate"><strong>{counts.roots}</strong><span>Nguyên nhân gốc · tối thiểu 1</span></div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}
      {loading ? <div className="empty-state compact">Đang tải RCA...</div> : null}

      {!loading ? <>
        <div className="rca-section">
          <h4>1. Timeline sự cố</h4>
          <p>Sắp xếp diễn biến theo thời gian; ghi nguồn thông tin nếu có để phân biệt dữ kiện với suy luận.</p>
          {timeline.map((row, index) => <div className="timeline-card" key={index}>
            <div className="timeline-grid">
              <label>Thời điểm<input type="datetime-local" disabled={!editable} value={row.event_time} onChange={(e) => patchTimeline(index, { event_time: e.target.value })} /></label>
              <label>Sự kiện / mốc chính *<input disabled={!editable} value={row.event_title} onChange={(e) => patchTimeline(index, { event_title: e.target.value })} placeholder="Ghi ngắn gọn một mốc đã được xác minh, ví dụ: Điều dưỡng phát hiện người bệnh té ngã." /></label>
              <label className="wide">Dữ kiện xác minh<textarea rows={2} placeholder="Ghi điều đã xác nhận từ hồ sơ, hệ thống hoặc phỏng vấn; chỉ ghi sự kiện thực tế, chưa kết luận nguyên nhân." disabled={!editable} value={row.event_description} onChange={(e) => patchTimeline(index, { event_description: e.target.value })} /></label>
              <label className="wide">Nguồn / minh chứng<input disabled={!editable} value={row.source_reference} onChange={(e) => patchTimeline(index, { source_reference: e.target.value })} placeholder="Ghi nơi kiểm chứng dữ kiện, ví dụ: HSBA ngày..., HIS, biên bản, phỏng vấn BS/ĐD..." /></label>
            </div>
            {editable && timeline.length > 1 ? <div className="row-actions"><button type="button" className="button tertiary small" onClick={() => setTimeline((current) => current.filter((_, i) => i !== index))}>Xóa mốc</button></div> : null}
          </div>)}
          {editable ? <button type="button" className="button secondary small" onClick={() => setTimeline((current) => [...current, emptyTimeline()])}>+ Thêm mốc Timeline</button> : null}
        </div>

        <div className="rca-section">
          <h4>2. Five Why · Phân tích sâu (tùy chọn)</h4>
          <p>Chỉ sử dụng khi cần đào sâu chuỗi nguyên nhân. Nếu bắt đầu dùng Five Why, cần tối thiểu 3 cấp; không bắt buộc dùng cho mọi RCA.</p>
          <div className="why-grid">
            {whys.map((row) => <div className="why-card" key={row.why_level}>
              <div className="why-level">Why {row.why_level}</div>
              <label>Trả lời<textarea rows={2} disabled={!editable} value={row.answer} onChange={(e) => patchWhy(row.why_level, { answer: e.target.value })} placeholder={`Tại sao ${row.why_level}?`} /></label>
              <label>Căn cứ / dữ kiện<textarea rows={2} disabled={!editable} value={row.evidence_note} onChange={(e) => patchWhy(row.why_level, { evidence_note: e.target.value })} placeholder="Ghi dữ kiện chứng minh cho câu trả lời phía trên; không ghi suy đoán nếu chưa có căn cứ." /></label>
            </div>)}
          </div>
        </div>

        <div className="rca-section">
          <h4>3. Fishbone · nhóm yếu tố hệ thống</h4>
          <p>Mỗi dòng là một yếu tố. Dùng cùng hệ phân loại với phần yếu tố góp phần để có thể phân tích xu hướng toàn viện.</p>
          <div className="fishbone-grid">
            {CATEGORIES.map((category) => <div className="fishbone-card" key={category.code}>
              <strong>{category.label}</strong>
              <textarea rows={4} disabled={!editable} value={fishbone[category.code] || ""} onChange={(e) => setFishbone((current) => ({ ...current, [category.code]: e.target.value }))} placeholder="Mỗi dòng ghi 1 yếu tố góp phần thuộc đúng nhóm này. Ví dụ: Nhóm làm việc — bàn giao ca chưa đầy đủ." />
              <small>Không ghi tên cá nhân; mô tả điều kiện/hệ thống tạo ra nguy cơ.</small>
            </div>)}
          </div>
        </div>

        <div className="rca-section">
          <h4>4. Nguyên nhân gốc</h4>
          <p>Chỉ chốt nguyên nhân có thể giải thích chuỗi sự kiện và có căn cứ. Nguyên nhân gốc phải đủ cụ thể để chuyển thành Action/CAPA.</p>
          {roots.map((row, index) => <div className="root-card" key={index}>
            <div className="root-grid">
              <label>Nhóm<select disabled={!editable} value={row.category_code} onChange={(e) => patchRoot(index, { category_code: e.target.value })}><option value="">Chưa phân nhóm</option>{CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}</select></label>
              <label>Nguyên nhân gốc *<textarea rows={2} disabled={!editable} value={row.cause_statement} onChange={(e) => patchRoot(index, { cause_statement: e.target.value })} placeholder="Nêu vấn đề hệ thống có thể can thiệp để giảm tái diễn; tránh chỉ ghi tên hoặc lỗi của một cá nhân."/></label>
              <label className="wide">Căn cứ chứng minh<textarea rows={2} disabled={!editable} value={row.evidence_basis} onChange={(e) => patchRoot(index, { evidence_basis: e.target.value })} placeholder="Nêu căn cứ dẫn đến kết luận nguyên nhân gốc: mốc Timeline, yếu tố Fishbone, Five Why (nếu dùng), HSBA hoặc dữ liệu liên quan." /></label>
              <label className="root-check wide"><input type="checkbox" disabled={!editable} checked={row.action_required} onChange={(e) => patchRoot(index, { action_required: e.target.checked })} /> Cần Action/CAPA để kiểm soát nguyên nhân này</label>
            </div>
            {editable && roots.length > 1 ? <div className="row-actions"><button type="button" className="button tertiary small" onClick={() => setRoots((current) => current.filter((_, i) => i !== index))}>Xóa nguyên nhân</button></div> : null}
          </div>)}
          {editable ? <button type="button" className="button secondary small" onClick={() => setRoots((current) => [...current, emptyRoot()])}>+ Thêm nguyên nhân gốc</button> : null}
        </div>

        <div className="rca-actions">
          <span className="rca-help">{editable ? "Lưu có thể thực hiện nhiều lần. Mỗi lần lưu được ghi Audit Log; RCA chỉ được hoàn tất khi đủ gate." : "RCA đang ở chế độ chỉ đọc theo trạng thái hồ sơ hiện tại."}</span>
          {editable ? <button type="button" className="button primary" disabled={saving} onClick={save}>{saving ? "Đang lưu RCA..." : "Lưu RCA có cấu trúc"}</button> : null}
        </div>
      </> : null}
    </div>
  );
}
