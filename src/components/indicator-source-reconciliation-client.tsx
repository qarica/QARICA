"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  assignment_id: string;
  definition_id: string;
  code: string | null;
  name: string;
  current_frequency: string | null;
  current_active_from: string | null;
  auto_create_periods: boolean;
};

type BlueprintRow = {
  key: string;
  source_code: string;
  name: string;
  owner: string;
  frequency: "MONTHLY" | "QUARTERLY";
  active_from: string;
  note: string;
  status: "MATCHED" | "AMBIGUOUS" | "MISSING";
  candidates: Candidate[];
};

const FREQ_LABEL: Record<string, string> = { MONTHLY: "Hằng tháng", QUARTERLY: "Hằng quý" };

export function IndicatorSourceReconciliationClient({
  rows,
  canManage,
}: {
  rows: BlueprintRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const ready = useMemo(() => rows.filter((row) => row.status === "MATCHED" && row.candidates[0]), [rows]);
  const isConfigured = (row: BlueprintRow, candidate?: Candidate | null) => !!candidate
    && candidate.auto_create_periods
    && candidate.current_frequency === row.frequency
    && candidate.current_active_from === row.active_from;
  const configuredCount = rows.filter((row) =>
    row.candidates.some((candidate) => isConfigured(row, candidate)),
  ).length;

  async function configure(row: BlueprintRow, assignmentId: string) {
    const response = await fetch(`/api/indicators/assignments/${assignmentId}/automation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frequency: row.frequency,
        active_from: row.active_from,
        active_to: "2026-12-31",
        auto_create_periods: true,
        source_reference: "Kế hoạch QLCL 2026 · Phụ lục 3 · 10 chỉ số cấp bệnh viện vận hành thí điểm quý IV/2026",
      }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || `Không cấu hình được ${row.name}.`);
    return json;
  }

  async function applyOne(row: BlueprintRow) {
    const assignmentId = row.status === "MATCHED"
      ? row.candidates[0]?.assignment_id
      : selection[row.key];
    if (!assignmentId) {
      setMessage({ tone: "error", text: "Vui lòng chọn đúng chỉ số hiện có trước khi xác nhận." });
      return;
    }
    setBusy(true);
    setMessage({ tone: "info", text: `Đang áp dụng cấu hình nguồn cho “${row.name}”…` });
    try {
      const selectedCandidate = row.candidates.find((item) => item.assignment_id === assignmentId);
      await configure(row, assignmentId);
      if (selectedCandidate) {
        const aliasResponse = await fetch("/api/indicators/source-aliases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_system: "QLCL_2026",
            source_code: row.source_code,
            source_label: row.name,
            indicator_definition_id: selectedCandidate.definition_id,
          }),
        });
        const aliasJson = await aliasResponse.json();
        if (!aliasResponse.ok) throw new Error(aliasJson.error || "Không lưu được ánh xạ mã nguồn.");
      }
      setMessage({ tone: "success", text: `Đã cấu hình “${row.name}”. QARICA sẽ tự tạo kỳ đo từ ${row.active_from.split("-").reverse().join("/")}.` });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không cấu hình được chỉ số." });
    } finally {
      setBusy(false);
    }
  }

  async function applyAllClearMatches() {
    if (!ready.length) return;
    setBusy(true);
    setMessage({ tone: "info", text: "Đang áp dụng các mục khớp rõ theo Kế hoạch QLCL 2026…" });
    try {
      let changed = 0;
      for (const row of ready) {
        const candidate = row.candidates[0];
        const already = candidate.auto_create_periods
          && candidate.current_frequency === row.frequency
          && candidate.current_active_from === row.active_from;
        if (already) continue;
        await configure(row, candidate.assignment_id);
        changed += 1;
      }
      setMessage({ tone: "success", text: changed ? `Đã cấu hình tự động ${changed} chỉ số khớp rõ. Các mục chưa rõ vẫn chờ người dùng xác nhận.` : "Các chỉ số khớp rõ đã được cấu hình đầy đủ." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Không áp dụng được cấu hình nguồn." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel indicator-source-reconcile">
    <style>{`
      .indicator-source-reconcile{overflow:hidden}
      .isr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:15px 17px;border-bottom:1px solid #e8eef2;background:linear-gradient(135deg,#fbfdff,#f4f8fc)}
      .isr-head strong{display:block;font-size:14px;color:#193b61}.isr-head p{margin:4px 0 0;font-size:10.5px;color:#64748b;line-height:1.45;max-width:820px}
      .isr-summary{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.isr-chip{padding:5px 8px;border-radius:999px;background:#eef4f8;color:#4a6277;font-size:9px;font-weight:850}.isr-chip.ok{background:#e9f6ef;color:#1d6b47}.isr-chip.warn{background:#fff7e8;color:#8a5a12}
      .isr-list{display:grid;gap:8px;padding:12px 14px 14px}.isr-row{display:grid;grid-template-columns:minmax(0,1.7fr) 110px 160px 150px auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;padding:11px 12px;background:#fff}.isr-row.needs{border-color:#f0d39c;background:#fffdfa}.isr-row.missing{border-color:#efc4c9;background:#fffafb}
      .isr-title strong{font-size:11.5px;color:#27384d}.isr-title small{display:block;margin-top:3px;color:#74838e;font-size:9.5px;line-height:1.4}.isr-meta strong{display:block;font-size:10.5px}.isr-meta small{display:block;margin-top:2px;color:#7a8994;font-size:9px}.isr-status{font-size:9px;font-weight:850;padding:5px 7px;border-radius:999px;background:#eef3f7;color:#53687a;display:inline-flex;width:max-content}.isr-status.ok{background:#e9f6ef;color:#1d6b47}.isr-status.warn{background:#fff2d6;color:#8a5a12}.isr-status.bad{background:#fff0f1;color:#a83243}
      .isr-select{min-width:145px;max-width:100%}.isr-action{display:flex;justify-content:flex-end}.isr-action .button{white-space:nowrap}
      @media(max-width:1000px){.isr-row{grid-template-columns:1fr 1fr}.isr-title{grid-column:1/-1}.isr-action{justify-content:flex-start}}
      @media(max-width:650px){.isr-head{display:grid}.isr-row{grid-template-columns:1fr}.isr-title{grid-column:auto}.isr-action .button{width:100%;justify-content:center}}
    `}</style>

    <div className="isr-head">
      <div>
        <strong>Đối chiếu nguồn · 10 chỉ số thí điểm quý IV/2026</strong>
        <p>QARICA đã đọc cấu hình từ biểu đăng ký chỉ số/Kế hoạch QLCL 2026. Chỉ mục khớp rõ mới được áp dụng tự động; mục có nhiều khả năng phù hợp buộc người dùng xác nhận một lần, không tự đoán.</p>
      </div>
      <div className="isr-summary">
        <span className="isr-chip ok">{configuredCount}/{rows.length} đã cấu hình</span>
        <span className="isr-chip">{ready.length} khớp rõ</span>
        <span className="isr-chip warn">{rows.filter((row) => row.status === "AMBIGUOUS").length} cần xác nhận</span>
        {canManage ? <button className="button secondary small" disabled={busy} onClick={applyAllClearMatches}>Áp dụng tất cả mục khớp rõ</button> : null}
      </div>
    </div>

    {message ? <div className={`alert ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : "info"}`} style={{ margin: "10px 14px 0" }}>{message.text}</div> : null}

    <div className="isr-list">
      {rows.map((row) => {
        const selectedCandidate = row.candidates.find((item) => item.assignment_id === selection[row.key]) || null;
        const candidate = row.status === "MATCHED" ? row.candidates[0] : selectedCandidate;
        const configured = isConfigured(row, candidate);
        const className = row.status === "MISSING" ? "missing" : row.status === "AMBIGUOUS" ? "needs" : "";
        return <div className={`isr-row ${className}`} key={row.key}>
          <div className="isr-title">
            <strong>{candidate?.code ? `${candidate.code} · ` : ""}{row.name}</strong>
            <small>{row.source_code ? `Mã nguồn: ${row.source_code} · ` : ""}{row.owner} · {row.note}</small>
          </div>
          <div className="isr-meta"><strong>{FREQ_LABEL[row.frequency]}</strong><small>Từ 01/10/2026</small></div>
          <div>
            {row.status === "MATCHED" ? <><span className={`isr-status ${configured ? "ok" : "warn"}`}>{configured ? "Đã đồng bộ nguồn" : "Khớp rõ · chờ áp dụng"}</span><div className="isr-meta" style={{ marginTop: 4 }}><small>{candidate?.code} · {candidate?.name}</small></div></>
              : row.status === "AMBIGUOUS" ? <span className="isr-status warn">Có {row.candidates.length} khả năng phù hợp</span>
              : <span className="isr-status bad">Chưa có chỉ số phù hợp</span>}
          </div>
          <div>
            {row.status === "AMBIGUOUS" ? <select className="isr-select" value={selection[row.key] || ""} onChange={(e) => setSelection((current) => ({ ...current, [row.key]: e.target.value }))}>
              <option value="">-- Xác nhận chỉ số --</option>
              {row.candidates.map((item) => <option value={item.assignment_id} key={item.assignment_id}>{item.code || "—"} · {item.name}</option>)}
            </select> : row.status === "MISSING" ? <span className="muted" style={{ fontSize: 10 }}>Theo nguyên tắc 1B: tạo/chọn master trước</span> : <span className="muted" style={{ fontSize: 10 }}>{candidate?.current_frequency ? `Hiện tại: ${FREQ_LABEL[candidate.current_frequency] || candidate.current_frequency}` : "Chưa có tần suất"}</span>}
          </div>
          <div className="isr-action">
            {canManage && row.status !== "MISSING" && !configured ? <button className="button primary small" disabled={busy || (row.status === "AMBIGUOUS" && !selection[row.key])} onClick={() => applyOne(row)}>Xác nhận & áp dụng</button> : configured ? <span className="isr-status ok">✓ Tự tạo kỳ đo</span> : null}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
